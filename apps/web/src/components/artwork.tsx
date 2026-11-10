import { useCallback, type PointerEvent } from "react";
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

/** Tracks a fine pointer inside a `relative group` surface for `SpotlightLayer`. */
export function useSpotlight<T extends HTMLElement>() {
  return useCallback((event: PointerEvent<T>) => {
    if (event.pointerType !== "mouse") return;
    const target = event.currentTarget;
    const bounds = target.getBoundingClientRect();
    target.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
    target.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
  }, []);
}

/** A soft light and a lit border edge that follow the pointer while the group is hovered. */
export function SpotlightLayer() {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(22rem_circle_at_var(--spot-x,50%)_var(--spot-y,0%),color-mix(in_oklch,var(--foreground)_6%,transparent),transparent_70%)] opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] border border-transparent [background:radial-gradient(14rem_circle_at_var(--spot-x,50%)_var(--spot-y,0%),color-mix(in_oklch,var(--foreground)_40%,transparent),transparent_70%)_border-box] opacity-0 [mask:linear-gradient(#000_0_0)_padding-box_exclude,linear-gradient(#000_0_0)] group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"
      />
    </>
  );
}
