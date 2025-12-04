import { Button } from "@raypx/ui/components/button";
import type * as React from "react";

export const ErrorComponent: React.ReactNode = (
  <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm">
    <p className="text-destructive">Something went wrong. Please try again.</p>
  </div>
);

interface ErrorWithRetryProps {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function ErrorWithRetry({
  message = "Something went wrong. Please try again.",
  onRetry,
  retrying = false,
}: ErrorWithRetryProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12 text-sm">
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <Button disabled={retrying} onClick={onRetry} size="sm" variant="outline">
          {retrying ? "Retrying…" : "Try again"}
        </Button>
      )}
    </div>
  );
}
