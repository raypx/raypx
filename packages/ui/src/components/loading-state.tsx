/* eslint-disable jsx-a11y/prefer-tag-over-role -- A loading region holds block placeholders; output is a form calculation element. */
import type { ComponentProps } from "react";
import { cn } from "../utils.js";
import { Skeleton } from "./skeleton.js";

export interface LoadingStateProps extends ComponentProps<"div"> {
  label?: string;
}

/** Preserve content shape while announcing loading once to assistive technology. */
export function LoadingState({
  label = "Loading…",
  children,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("space-y-3", className)}
      {...props}
    >
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        {children ?? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        )}
      </div>
    </div>
  );
}
