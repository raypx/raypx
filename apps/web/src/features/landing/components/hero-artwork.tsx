import { useEffect, useRef, type RefObject } from "react";

import { prepareHeroTrails } from "./hero-trails.js";

export function HeroArtwork({ frameRef }: { frameRef: RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    const target = canvas?.closest("header");
    const light = frame?.querySelector<HTMLElement>("[data-hero-frame-light]");
    const context = canvas?.getContext("2d");
    if (!canvas || !frame || !target || !light || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(any-pointer: fine)");
    let visible = true;
    let request = 0;
    let elapsed = 0;
    let previous: number | undefined;
    let draw: ReturnType<typeof prepareHeroTrails>;
    let pointer: { x: number; y: number } | null = null;

    function stop() {
      cancelAnimationFrame(request);
      request = 0;
      previous = undefined;
    }

    function tick(time: number) {
      request = requestAnimationFrame(tick);
      const delta = previous === undefined ? 0 : time - previous;
      if (previous !== undefined && delta < 32) return;
      elapsed += delta;
      previous = time;
      draw?.(elapsed, false, pointer);
    }

    function update() {
      if (!visible || document.hidden || reducedMotion.matches) {
        stop();
        if (reducedMotion.matches) draw?.(elapsed, true, null);
        return;
      }
      if (!request) request = requestAnimationFrame(tick);
    }

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.ceil(bounds.width * ratio);
      canvas.height = Math.ceil(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw = prepareHeroTrails(
        context,
        light,
        bounds.width,
        bounds.height,
        frameBounds.top - bounds.top,
        frameBounds.width,
        ratio,
      );
      draw?.(elapsed, reducedMotion.matches, null);
    };

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      if (!visible) pointer = null;
      update();
    });
    const observer = new ResizeObserver(resize);
    const theme = new MutationObserver(resize);

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !finePointer.matches || reducedMotion.matches) return;
      const bounds = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };
    const leave = () => {
      pointer = null;
    };

    observer.observe(canvas);
    observer.observe(frame);
    intersection.observe(canvas);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    document.addEventListener("visibilitychange", update);
    reducedMotion.addEventListener("change", update);
    target.addEventListener("pointermove", move, { passive: true });
    target.addEventListener("pointerleave", leave);
    resize();
    update();

    return () => {
      stop();
      observer.disconnect();
      intersection.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", update);
      reducedMotion.removeEventListener("change", update);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerleave", leave);
      light.style.removeProperty("--hero-frame-light");
    };
  }, [frameRef]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-27 -bottom-3 left-1/2 -z-10 w-[min(100vw,96rem)] -translate-x-1/2 overflow-hidden forced-colors:hidden"
    >
      <div className="absolute inset-0 [background:radial-gradient(ellipse_36%_68%_at_15%_44%,color-mix(in_srgb,var(--brand-sky)_14%,transparent),transparent),radial-gradient(ellipse_36%_68%_at_87%_46%,color-mix(in_srgb,var(--brand-violet)_14%,transparent),transparent),radial-gradient(ellipse_44%_42%_at_58%_89%,color-mix(in_srgb,var(--brand-blue)_10%,transparent),transparent)] mask-[radial-gradient(ellipse_50%_50%_at_center,#000_48%,transparent)]" />
      <canvas ref={canvasRef} aria-hidden="true" className="relative block size-full" />
    </div>
  );
}
