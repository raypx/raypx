/**
 * Centralized error handling for tRPC
 * Provides custom error types, error codes, and error utilities
 */

import { TRPCError } from "@trpc/server";
import type { TRPC_ERROR_CODE_KEY } from "@trpc/server/unstable-core-do-not-import";

/**
 * Application-specific error codes
 * These codes help identify the exact error scenario beyond generic HTTP status codes
 */
export enum AppErrorCode {
  // Resource errors (404)
  USER_NOT_FOUND = "USER_NOT_FOUND",
  RESOURCE_NOT_FOUND = "RESOURCE_NOT_FOUND",

  // Authorization errors (403)
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",
  RESOURCE_ACCESS_DENIED = "RESOURCE_ACCESS_DENIED",

  // Validation errors (400)
  INVALID_INPUT = "INVALID_INPUT",
  DUPLICATE_RESOURCE = "DUPLICATE_RESOURCE",

  // Business logic errors (422)
  BUSINESS_RULE_VIOLATION = "BUSINESS_RULE_VIOLATION",
  OPERATION_NOT_ALLOWED = "OPERATION_NOT_ALLOWED",

  // Database errors (500)
  DATABASE_ERROR = "DATABASE_ERROR",
  TRANSACTION_FAILED = "TRANSACTION_FAILED",

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Generic errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
}

/**
 * Mapping from application error codes to tRPC error codes
 * This ensures proper HTTP status codes are returned
 */
export const ERROR_CODE_MAP: Record<AppErrorCode, TRPC_ERROR_CODE_KEY> = {
  // 404 Not Found
  [AppErrorCode.USER_NOT_FOUND]: "NOT_FOUND",
  [AppErrorCode.RESOURCE_NOT_FOUND]: "NOT_FOUND",

  // 403 Forbidden
  [AppErrorCode.INSUFFICIENT_PERMISSIONS]: "FORBIDDEN",
  [AppErrorCode.RESOURCE_ACCESS_DENIED]: "FORBIDDEN",

  // 400 Bad Request
  [AppErrorCode.INVALID_INPUT]: "BAD_REQUEST",
  [AppErrorCode.DUPLICATE_RESOURCE]: "BAD_REQUEST",

  // 422 Unprocessable Entity
  [AppErrorCode.BUSINESS_RULE_VIOLATION]: "UNPROCESSABLE_CONTENT",
  [AppErrorCode.OPERATION_NOT_ALLOWED]: "UNPROCESSABLE_CONTENT",

  // 500 Internal Server Error
  [AppErrorCode.DATABASE_ERROR]: "INTERNAL_SERVER_ERROR",
  [AppErrorCode.TRANSACTION_FAILED]: "INTERNAL_SERVER_ERROR",
  [AppErrorCode.INTERNAL_ERROR]: "INTERNAL_SERVER_ERROR",
  [AppErrorCode.EXTERNAL_SERVICE_ERROR]: "INTERNAL_SERVER_ERROR",

  // 429 Too Many Requests
  [AppErrorCode.RATE_LIMIT_EXCEEDED]: "TOO_MANY_REQUESTS",
};

/**
 * Error metadata interface for additional context
 */
export interface ErrorMeta {
  /**
   * Application-specific error code
   */
  code: AppErrorCode;

  /**
   * i18n translation key for the error message
   * Used by clients to display localized error messages
   */
  translationKey?: string;

  /**
   * Parameters for the translation
   * Used to interpolate values into the translated message
   */
  translationParams?: Record<string, string | number>;

  /**
   * Additional context about the error
   */
  context?: Record<string, unknown>;

  /**
   * Timestamp when the error occurred
   */
  timestamp?: Date;

  /**
   * Request ID for tracing
   */
  requestId?: string;
}

/**
 * Create a standardized tRPC error with application-specific metadata
 *
 * @param appErrorCode - Application error code
 * @param message - Human-readable error message
 * @param meta - Additional error metadata
 * @returns TRPCError with proper typing and metadata
 *
 * @example
 * ```ts
 * throw createAppError(
 *   AppErrorCode.USER_NOT_FOUND,
 *   "User with ID 123 does not exist",
 *   { context: { userId: "123" } }
 * );
 * ```
 */
export function createAppError(
  appErrorCode: AppErrorCode,
  message: string,
  meta?: Omit<ErrorMeta, "code" | "timestamp">,
): TRPCError {
  const trpcCode = ERROR_CODE_MAP[appErrorCode];
  const errorMeta: ErrorMeta = {
    code: appErrorCode,
    timestamp: new Date(),
    ...meta,
  };

  return new TRPCError({
    code: trpcCode,
    message,
    cause: errorMeta,
  });
}

/**
 * Check if an error is an application error
 */
export function isAppError(error: unknown): error is TRPCError & { cause: ErrorMeta } {
  return (
    error instanceof TRPCError &&
    typeof error.cause === "object" &&
    error.cause !== null &&
    "code" in error.cause &&
    Object.values(AppErrorCode).includes((error.cause as ErrorMeta).code)
  );
}

/**
 * Common error factory functions for frequently used errors
 * All errors include i18n translation keys for client-side localization
 */
export const Errors = {
  /**
   * Throw when a user is not found
   */
  userNotFound: (userId: string) =>
    createAppError(AppErrorCode.USER_NOT_FOUND, `User with ID '${userId}' not found`, {
      context: { userId },
      translationKey: "errors.userNotFound",
      translationParams: { userId },
    }),

  /**
   * Throw when a resource is not found
   */
  resourceNotFound: (resourceType: string, resourceId: string) =>
    createAppError(
      AppErrorCode.RESOURCE_NOT_FOUND,
      `${resourceType} with ID '${resourceId}' not found`,
      {
        context: { resourceType, resourceId },
        translationKey: "errors.resourceNotFound",
        translationParams: { resourceType, resourceId },
      },
    ),

  /**
   * Throw when user lacks permissions
   */
  insufficientPermissions: (action: string, resource?: string) =>
    createAppError(
      AppErrorCode.INSUFFICIENT_PERMISSIONS,
      `Insufficient permissions to ${action}${resource ? ` ${resource}` : ""}`,
      {
        context: { action, resource },
        translationKey: "errors.insufficientPermissions",
        translationParams: { action, resource: resource || "" },
      },
    ),

  /**
   * Throw when user cannot access a resource
   */
  accessDenied: (resourceType: string, resourceId: string) =>
    createAppError(
      AppErrorCode.RESOURCE_ACCESS_DENIED,
      `Access denied to ${resourceType} '${resourceId}'`,
      {
        context: { resourceType, resourceId },
        translationKey: "errors.accessDenied",
        translationParams: { resourceType, resourceId },
      },
    ),

  /**
   * Throw when a resource already exists
   */
  duplicateResource: (resourceType: string, identifier: string) =>
    createAppError(
      AppErrorCode.DUPLICATE_RESOURCE,
      `${resourceType} with identifier '${identifier}' already exists`,
      {
        context: { resourceType, identifier },
        translationKey: "errors.duplicateResource",
        translationParams: { resourceType, identifier },
      },
    ),

  /**
   * Throw when a business rule is violated
   */
  businessRuleViolation: (rule: string, details?: string) =>
    createAppError(
      AppErrorCode.BUSINESS_RULE_VIOLATION,
      `Business rule violated: ${rule}${details ? `. ${details}` : ""}`,
      {
        context: { rule, details },
        translationKey: "errors.businessRuleViolation",
        translationParams: { rule, details: details || "" },
      },
    ),

  /**
   * Throw when an operation is not allowed
   */
  operationNotAllowed: (operation: string, reason: string) =>
    createAppError(
      AppErrorCode.OPERATION_NOT_ALLOWED,
      `Operation '${operation}' not allowed: ${reason}`,
      {
        context: { operation, reason },
        translationKey: "errors.operationNotAllowed",
        translationParams: { operation, reason },
      },
    ),

  /**
   * Throw when a database error occurs
   */
  databaseError: (operation: string, cause?: unknown) =>
    createAppError(AppErrorCode.DATABASE_ERROR, `Database error during ${operation}`, {
      context: { operation, originalError: cause },
      translationKey: "errors.databaseError",
      translationParams: { operation },
    }),

  /**
   * Throw when rate limit is exceeded
   */
  rateLimitExceeded: (limit: number, window: string) =>
    createAppError(
      AppErrorCode.RATE_LIMIT_EXCEEDED,
      `Rate limit exceeded: ${limit} requests per ${window}`,
      {
        context: { limit, window },
        translationKey: "errors.rateLimitExceeded",
        translationParams: { limit, window },
      },
    ),

  /**
   * Throw for generic internal errors
   */
  internalError: (message: string, cause?: unknown) =>
    createAppError(AppErrorCode.INTERNAL_ERROR, message, {
      context: { originalError: cause },
      translationKey: "errors.internalError",
      translationParams: {},
    }),
};
