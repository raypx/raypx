/**
 * Error handling utilities for common scenarios
 * Provides helper functions for graceful error handling in procedures
 */

import { TRPCError } from "@trpc/server";
import { Errors } from "../errors";

/**
 * PostgreSQL error interface
 * Matches the structure from postgres and @neondatabase/serverless packages
 */
interface PostgresError {
  code: string;
  message: string;
  detail?: string;
  hint?: string;
  position?: string;
  internalPosition?: string;
  internalQuery?: string;
  where?: string;
  schema?: string;
  table?: string;
  column?: string;
  dataType?: string;
  constraint?: string;
}

/**
 * Check if error is a PostgreSQL error
 */
function isPostgresError(error: unknown): error is PostgresError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PostgresError).code === "string"
  );
}

/**
 * Handle database errors with proper error mapping
 *
 * Maps PostgreSQL errors to user-friendly application errors
 *
 * @example
 * ```ts
 * try {
 *   await ctx.db.insert(User).values(data);
 * } catch (error) {
 *   throw handleDatabaseError(error, "create user");
 * }
 * ```
 */
export function handleDatabaseError(error: unknown, operation: string): TRPCError {
  if (isPostgresError(error)) {
    // Unique constraint violation (23505)
    if (error.code === "23505") {
      const match = error.message.match(/Key \((.*?)\)=/);
      const field = match?.[1] || "field";
      return Errors.duplicateResource("Resource", field);
    }

    // Foreign key violation (23503)
    if (error.code === "23503") {
      return Errors.businessRuleViolation(
        "Foreign key constraint",
        "Referenced resource does not exist",
      );
    }

    // Not null violation (23502)
    if (error.code === "23502") {
      const match = error.message.match(/column "(.*?)"/);
      const column = match?.[1] || "field";
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `Required field '${column}' is missing`,
      });
    }

    // Check violation (23514)
    if (error.code === "23514") {
      return new TRPCError({
        code: "BAD_REQUEST",
        message: "Data violates database constraints",
      });
    }
  }

  // Generic database error
  return Errors.databaseError(operation, error);
}

/**
 * Assert that a value exists, throwing a not found error if it doesn't
 *
 * @example
 * ```ts
 * const user = await ctx.db.query.user.findFirst({ where: eq(User.id, id) });
 * assertExists(user, () => Errors.userNotFound(id));
 * // user is now non-nullable
 * ```
 */
export function assertExists<T>(
  value: T | null | undefined,
  errorFactory: () => TRPCError,
): asserts value is T {
  if (value == null) {
    throw errorFactory();
  }
}

/**
 * Assert a condition, throwing an error if it's false
 *
 * @example
 * ```ts
 * assertCondition(
 *   user.role === "admin",
 *   () => Errors.insufficientPermissions("delete users")
 * );
 * ```
 */
export function assertCondition(
  condition: boolean,
  errorFactory: () => TRPCError,
): asserts condition {
  if (!condition) {
    throw errorFactory();
  }
}

/**
 * Wrap an async operation with error handling
 * Automatically catches and transforms errors
 *
 * @example
 * ```ts
 * const user = await withErrorHandling(
 *   async () => {
 *     return await ctx.db.query.user.findFirst({ where: eq(User.id, id) });
 *   },
 *   { operation: "fetch user", notFoundError: () => Errors.userNotFound(id) }
 * );
 * ```
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  options: {
    operation: string;
    notFoundError?: () => TRPCError;
    onError?: (error: unknown) => TRPCError | void;
  },
): Promise<T> {
  try {
    const result = await operation();

    // Check for null/undefined results
    if (result == null && options.notFoundError) {
      throw options.notFoundError();
    }

    return result;
  } catch (error) {
    // If it's already a TRPCError, re-throw it
    if (error instanceof TRPCError) {
      throw error;
    }

    // Try custom error handler first
    if (options.onError) {
      const customError = options.onError(error);
      if (customError) {
        throw customError;
      }
    }

    // Handle database errors
    throw handleDatabaseError(error, options.operation);
  }
}

/**
 * Check if user has permission to perform an action
 *
 * @example
 * ```ts
 * assertPermission(
 *   ctx.session.user.id === userId,
 *   "update",
 *   "user profile"
 * );
 * ```
 */
export function assertPermission(
  hasPermission: boolean,
  action: string,
  resource?: string,
): asserts hasPermission {
  assertCondition(hasPermission, () => Errors.insufficientPermissions(action, resource));
}

/**
 * Check if user owns a resource
 *
 * @example
 * ```ts
 * assertOwnership(
 *   ctx.session.user.id,
 *   post.authorId,
 *   "Post",
 *   post.id
 * );
 * ```
 */
export function assertOwnership(
  userId: string,
  resourceOwnerId: string,
  resourceType: string,
  resourceId: string,
): void {
  if (userId !== resourceOwnerId) {
    throw Errors.accessDenied(resourceType, resourceId);
  }
}

/**
 * Retry an operation with exponential backoff
 * Useful for transient errors (network, rate limits, etc.)
 *
 * @example
 * ```ts
 * const result = await retryWithBackoff(
 *   async () => await externalApi.call(),
 *   { maxRetries: 3, baseDelay: 1000 }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, shouldRetry = () => true } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts
      if (attempt >= maxRetries) {
        break;
      }

      // Check if we should retry this error
      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries failed
  throw lastError;
}

/**
 * Validate array has items
 *
 * @example
 * ```ts
 * validateNonEmpty(userIds, "User IDs are required");
 * ```
 */
export function validateNonEmpty<T>(
  array: T[],
  message = "Array cannot be empty",
): asserts array is [T, ...T[]] {
  if (array.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message,
    });
  }
}

/**
 * Safe JSON parse with error handling
 *
 * @example
 * ```ts
 * const data = safeJsonParse(input, "Invalid JSON format");
 * ```
 */
export function safeJsonParse<T = unknown>(jsonString: string, errorMessage = "Invalid JSON"): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: errorMessage,
    });
  }
}
