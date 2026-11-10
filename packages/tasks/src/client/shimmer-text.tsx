import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@raypx/ui/lib/utils";

/**
 * Text with a light that sweeps across it while work is in progress. The sweep is a Web
 * Animations loop on the background position, so it needs no global keyframes; reduced
 * motion and browsers without the API show ordinary muted text.
 */
export function ShimmerText({
  active,
  className,
  children,
}: {
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!active || !node || typeof node.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = node.animate(
      [{ backgroundPosition: "100% center" }, { backgroundPosition: "0% center" }],
      { duration: 1800, iterations: Infinity, easing: "linear" },
    );
    animation.finished.catch(() => {});
    return () => animation.cancel();
  }, [active]);

  return (
    <span
      ref={ref}
      className={cn(
        active &&
          "bg-[linear-gradient(90deg,transparent_35%,var(--color-background)_50%,transparent_65%),linear-gradient(var(--color-muted-foreground),var(--color-muted-foreground))] bg-size-[250%_100%,auto] bg-clip-text bg-no-repeat text-transparent forced-colors:bg-none forced-colors:text-[CanvasText]",
        className,
      )}
    >
      {children}
    </span>
  );
}
