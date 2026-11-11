import { useEffect, useRef } from "react";
import { cn } from "@raypx/ui/lib/utils";
import { accentGradient } from "../../../components/brand-accent.js";

/** One packet heads to Web (a session), the other returns to Desktop (an answer). */
const routes = [
  { from: "0%", to: "100%", delay: 0 },
  { from: "100%", to: "0%", delay: 1800 },
] as const;

/**
 * Light packets travelling along the connection line. They illustrate the route only,
 * never an observed connection; they pause offscreen and stay hidden under reduced motion.
 */
export function FlowPackets() {
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const packets = [...root.querySelectorAll<HTMLElement>("[data-packet]")];
    if (!packets.every((packet) => typeof packet.animate === "function")) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animations: Animation[] = [];
    let visible = true;

    const cancel = () => {
      for (const animation of animations) animation.cancel();
      animations = [];
    };
    const play = () => {
      cancel();
      if (reducedMotion.matches) return;
      animations = packets.map((packet, index) => {
        const route = routes[index] ?? routes[0];
        const animation = packet.animate(
          [
            { left: route.from, opacity: 0 },
            { opacity: 1, offset: 0.15 },
            { opacity: 1, offset: 0.85 },
            { left: route.to, opacity: 0 },
          ],
          {
            duration: 3600,
            delay: route.delay,
            iterations: Infinity,
            easing: "cubic-bezier(0.45, 0, 0.55, 1)",
          },
        );
        // Cancelling rejects `finished`; the loop never awaits it.
        animation.finished.catch(() => {});
        return animation;
      });
      if (!visible) for (const animation of animations) animation.pause();
    };

    play();
    reducedMotion.addEventListener("change", play);
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            for (const animation of animations) {
              if (visible) animation.play();
              else animation.pause();
            }
          });
    intersection?.observe(root);

    return () => {
      reducedMotion.removeEventListener("change", play);
      intersection?.disconnect();
      cancel();
    };
  }, []);

  return (
    <span ref={rootRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {routes.map((route) => (
        <span
          key={route.from}
          data-packet=""
          className={cn(
            "absolute top-1/2 size-2 -translate-1/2 rounded-full opacity-0 shadow-[0_0_10px_2px_color-mix(in_oklch,var(--brand-violet)_55%,transparent)]",
            accentGradient,
          )}
        />
      ))}
    </span>
  );
}
