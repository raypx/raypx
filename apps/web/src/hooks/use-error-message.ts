/**
 * Hook for translating tRPC error messages
 * Extracts translation keys and parameters from error metadata
 * and returns localized error messages
 */

import * as m from "@raypx/i18n/messages";
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
    return fallback || m.errors_generic();
  }

  // If no translation key, use error message
  if (!meta.translationKey) {
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return fallback || m.errors_generic();
  }

  // Map translation keys to paraglide message functions
  const params = meta.translationParams || {};

  try {
    switch (meta.translationKey) {
      case "errors.userNotFound":
        return m.errors_userNotFound(params as { userId: string });

      case "errors.resourceNotFound":
        return m.errors_resourceNotFound(params as { resourceType: string; resourceId: string });

      case "errors.insufficientPermissions":
        return m.errors_insufficientPermissions(params as { action: string; resource?: string });

      case "errors.accessDenied":
        return m.errors_accessDenied(params as { resourceType: string; resourceId: string });

      case "errors.duplicateResource":
        return m.errors_duplicateResource(params as { resourceType: string; identifier: string });

      case "errors.businessRuleViolation":
        return m.errors_businessRuleViolation(params as { rule: string; details?: string });

      case "errors.operationNotAllowed":
        return m.errors_operationNotAllowed(params as { operation: string; reason: string });

      case "errors.databaseError":
        return m.errors_databaseError(params as { operation: string });

      case "errors.rateLimitExceeded":
        return m.errors_rateLimitExceeded(params as { limit: number; window: string });

      case "errors.internalError":
        return m.errors_internalError();

      default:
        // Fallback to generic error message
        return m.errors_generic();
    }
  } catch {
    // If translation fails, use error message or fallback
    if (error && typeof error === "object" && "message" in error) {
      return String(error.message);
    }
    return fallback || m.errors_generic();
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
      return m.errors_unauthorized();

    case "FORBIDDEN":
      return m.errors_forbidden();

    case "NOT_FOUND":
      return m.errors_notFound();

    case "BAD_REQUEST":
    case "UNPROCESSABLE_CONTENT":
      return m.errors_invalidInput();

    case "CONFLICT":
      return m.errors_conflict();

    case "TOO_MANY_REQUESTS":
      return m.errors_tooManyRequests();

    case "INTERNAL_SERVER_ERROR":
      return m.errors_internalError();

    case "SERVICE_UNAVAILABLE":
      return m.errors_serviceUnavailable();

    default:
      return m.errors_generic();
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
    if (codeMessage !== m.errors_generic()) {
      return codeMessage;
    }
  }

  // Try custom translation key
  return useErrorMessage(error, fallback);
}
