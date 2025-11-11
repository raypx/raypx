/**
 * Hook for translating tRPC error messages
 * Extracts translation keys and parameters from error metadata
 * and returns localized error messages
 */
import type { ErrorMeta } from "@raypx/trpc";
import type { TRPCClientErrorLike } from "@trpc/client";

/**
 * Extract error metadata from tRPC error
 */
function getErrorMeta(error: unknown): ErrorMeta | null {
  if (!error || typeof error !== "object") return null;

  const trpcError = error as TRPCClientErrorLike<any>;
  if (!trpcError.data?.cause) return null;

  const cause = trpcError.data.cause as ErrorMeta;
  if (!cause.code) return null;

  return cause;
}

/**
 * Get localized error message from tRPC error
 * Falls back to English message if translation is not available
 *
 * @param error - tRPC client error
 * @param fallback - Optional fallback message
 * @returns Localized error message
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const query = trpc.users.byId.useQuery({ id: "123" });
 *
 *   if (query.error) {
 *     const message = useErrorMessage(query.error);
 *     return <div>Error: {message}</div>;
 *   }
 *
 *   return <div>{query.data.name}</div>;
 * }
 * ```
 */
export function useErrorMessage(error: unknown, fallback?: string): string {
  const meta = getErrorMeta(error);

  // If no metadata, use error message or fallback
  if (!meta) {
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return fallback || "An error occurred";
  }

  // If no translation key, use error message
  if (!meta.translationKey) {
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return fallback || "An error occurred";
  }

  // Map translation keys to error messages
  const params = meta.translationParams || {};

  try {
    switch (meta.translationKey) {
      case "errors.userNotFound":
        return `User not found: ${(params as { userId: string }).userId}`;

      case "errors.resourceNotFound":
        return `${(params as { resourceType: string; resourceId: string }).resourceType} not found: ${(params as { resourceType: string; resourceId: string }).resourceId}`;

      case "errors.insufficientPermissions":
        return `Insufficient permissions: ${(params as { action: string; resource?: string }).action}`;

      case "errors.accessDenied":
        return `Access denied: ${(params as { resourceType: string; resourceId: string }).resourceType}`;

      case "errors.duplicateResource":
        return `Duplicate ${(params as { resourceType: string; identifier: string }).resourceType}: ${(params as { resourceType: string; identifier: string }).identifier}`;

      case "errors.businessRuleViolation":
        return `Business rule violation: ${(params as { rule: string; details?: string }).rule}`;

      case "errors.operationNotAllowed":
        return `Operation not allowed: ${(params as { operation: string; reason: string }).operation}`;

      case "errors.databaseError":
        return `Database error: ${(params as { operation: string }).operation}`;

      case "errors.rateLimitExceeded":
        return `Rate limit exceeded: ${(params as { limit: number; window: string }).limit} requests per ${(params as { limit: number; window: string }).window}`;

      case "errors.internalError":
        return "Internal server error";

      default:
        // Fallback to generic error message
        return "An error occurred";
    }
  } catch {
    // If translation fails, use error message or fallback
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return fallback || "An error occurred";
  }
}

/**
 * Get localized error message for common tRPC error codes
 * Use this for errors without custom translation keys
 *
 * @param code - tRPC error code
 * @returns Localized error message
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const mutation = trpc.users.create.useMutation({
 *     onError: (error) => {
 *       const message = getErrorMessageForCode(error.data?.code);
 *       toast.error(message);
 *     },
 *   });
 * }
 * ```
 */
export function getErrorMessageForCode(code?: string): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Unauthorized";

    case "FORBIDDEN":
      return "Forbidden";

    case "NOT_FOUND":
      return "Not found";

    case "BAD_REQUEST":
    case "UNPROCESSABLE_CONTENT":
      return "Invalid input";

    case "CONFLICT":
      return "Conflict";

    case "TOO_MANY_REQUESTS":
      return "Too many requests";

    case "INTERNAL_SERVER_ERROR":
      return "Internal server error";

    case "SERVICE_UNAVAILABLE":
      return "Service unavailable";

    default:
      return "An error occurred";
  }
}

/**
 * React hook for error message translation
 * Combines custom error messages with fallback to tRPC error codes
 *
 * @param error - tRPC client error
 * @param options - Options for error message
 * @returns Localized error message
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const query = trpc.users.byId.useQuery({ id: "123" });
 *   const errorMessage = useError(query.error);
 *
 *   if (query.error) {
 *     return <div>Error: {errorMessage}</div>;
 *   }
 *
 *   return <div>{query.data.name}</div>;
 * }
 * ```
 */
export function useError(
  error: unknown,
  options?: {
    fallback?: string;
    preferCode?: boolean;
  },
): string {
  const { fallback, preferCode = false } = options || {};

  // If preferCode is true, try code-based translation first
  if (preferCode && error && typeof error === "object" && "data" in error) {
    const trpcError = error as TRPCClientErrorLike<any>;
    const codeMessage = getErrorMessageForCode(trpcError.data?.code);
    if (codeMessage !== "An error occurred") {
      return codeMessage;
    }
  }

  // Try custom translation key
  return useErrorMessage(error, fallback);
}
