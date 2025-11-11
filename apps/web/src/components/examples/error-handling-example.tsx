/**
 * Example components demonstrating i18n error handling with tRPC
 * These examples show best practices for displaying localized error messages
 */

import { Alert, AlertDescription, AlertTitle } from "@raypx/ui/components/alert";
import { Button } from "@raypx/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@raypx/ui/components/card";
import type { TRPCClientError } from "@trpc/client";
import { AlertCircle, RefreshCw } from "lucide-react";
import { getErrorMessageForCode, useError, useErrorMessage } from "~/hooks/use-error-message";

/**
 * Example 1: Simple error display with automatic translation
 */
export function SimpleErrorExample({ error }: { error: unknown }) {
  const errorMessage = useErrorMessage(error);

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}

/**
 * Example 2: Error display with retry button
 */
export function ErrorWithRetryExample({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const errorMessage = useError(error, {
    fallback: "An unexpected error occurred",
  });

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          Error
        </CardTitle>
        <CardDescription>{errorMessage}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onRetry} size="sm" variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Example 3: Query error handler with different error types
 */
export function QueryErrorExample({ error }: { error: TRPCClientError<any> }) {
  // Use code-based translation for generic errors
  const errorMessage = useError(error, {
    preferCode: true,
  });

  // Get error code for styling
  const errorCode = error.data?.code;

  // Different styling based on error type
  const isNotFound = errorCode === "NOT_FOUND";
  const isUnauthorized = errorCode === "UNAUTHORIZED";
  const isRateLimit = errorCode === "TOO_MANY_REQUESTS";

  return (
    <Alert variant={isNotFound ? "default" : "destructive"}>
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>
        {isNotFound && "Not Found"}
        {isUnauthorized && "Authentication Required"}
        {isRateLimit && "Too Many Requests"}
        {!isNotFound && !isUnauthorized && !isRateLimit && "Error"}
      </AlertTitle>
      <AlertDescription>{errorMessage}</AlertDescription>
    </Alert>
  );
}

/**
 * Example 4: Mutation error handler with field-specific errors
 */
export function MutationErrorExample({ error }: { error: TRPCClientError<any> }) {
  const errorMessage = useErrorMessage(error);

  // Check for Zod validation errors
  const zodErrors = error.data?.zodError;

  return (
    <div className="space-y-2">
      {/* Main error message */}
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Failed to save</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>

      {/* Field-specific validation errors */}
      {zodErrors && (
        <div className="space-y-1">
          {Object.entries(zodErrors.fieldErrors).map(([field, errors]) => (
            <Alert key={field} variant="destructive">
              <AlertDescription>
                <strong>{field}:</strong> {(errors as string[])?.join(", ")}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Example 5: Inline error message (for forms)
 */
export function InlineErrorExample({ error }: { error?: unknown }) {
  if (!error) return null;

  const errorMessage = useErrorMessage(error, "Invalid value");

  return <p className="text-sm font-medium text-destructive">{errorMessage}</p>;
}

/**
 * Example 6: Toast notification error handler
 * Use this pattern with sonner or another toast library
 */
export function handleErrorWithToast(error: unknown, toast: any) {
  // Get localized error message
  const message = useErrorMessage(error);

  // Get error code for additional handling
  if (error && typeof error === "object" && "data" in error) {
    const trpcError = error as TRPCClientError<any>;
    const code = trpcError.data?.code;

    // Handle specific error codes differently
    if (code === "UNAUTHORIZED") {
      // Redirect to login
      window.location.href = "/login";
      return;
    }

    if (code === "TOO_MANY_REQUESTS") {
      // Show warning toast with longer duration
      toast.warning(message, { duration: 5000 });
      return;
    }
  }

  // Default error toast
  toast.error(message);
}

/**
 * Example 7: Error boundary fallback with translation
 */
export function ErrorBoundaryFallback({ error, reset }: { error: unknown; reset?: () => void }) {
  const errorMessage = useErrorMessage(error, "Something went wrong");

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <AlertCircle className="h-12 w-12 text-destructive" />
      <div className="text-center">
        <h2 className="text-2xl font-bold">Oops!</h2>
        <p className="mt-2 text-muted-foreground">{errorMessage}</p>
      </div>
      {reset && (
        <Button onClick={reset} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}

/**
 * Example 8: Complete tRPC query/mutation component
 */
export function CompleteExample() {
  // Example implementation would go here
  // This shows how to integrate error handling in a real component

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">User Profile</h2>

      {/* Example usage:
      const query = trpc.users.byId.useQuery({ id: userId });

      if (query.isLoading) {
        return <LoadingSpinner />;
      }

      if (query.error) {
        return <SimpleErrorExample error={query.error} />;
      }

      return <UserProfile user={query.data} />;
      */}
    </div>
  );
}
