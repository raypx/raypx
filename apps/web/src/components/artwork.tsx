import { cn } from "@raypx/ui/lib/utils";

/**
 * Shared decoration for public pages. Everything here is `aria-hidden`, built from
 * neutral tokens and inert under reduced motion (the global rule removes animations
 * and transitions).
 */

/** Neutral dot grid; the parent positions it (`relative isolate`) and callers mask it. */
export function DotGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(color-mix(in_oklch,var(--foreground)_14%,transparent)_1px,transparent_1px)] bg-size-[16px_16px]",
        className,
      )}
    />
  );
}
