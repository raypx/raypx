import { useEffect, useRef } from "react";
import { cn } from "@raypx/ui/lib/utils";

type Rgb = readonly [number, number, number];
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: Rgb;
  phase: number;
};

const paletteVars = ["--landing-sky", "--landing-blue", "--landing-violet", "--landing-pink"];
const fallbackColor: Rgb = [88, 141, 246];
const linkDistance = 130;
const pointerRadius = 150;
const maxParticles = 110;
const areaPerParticle = 10_000;

function parseHex(value: string): Rgb | null {
  const hex = value.trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function readPalette(element: HTMLElement): Rgb[] {
  const style = getComputedStyle(element);
  const colors = paletteVars
    .map((name) => parseHex(style.getPropertyValue(name)))
    .filter((color): color is Rgb => color !== null);
  return colors.length ? colors : [fallbackColor];
}

function rgba([r, g, b]: Rgb, alpha: number) {
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function isDarkTheme() {
  return document.documentElement.dataset.theme === "dark";
}

function seed(width: number, height: number, palette: Rgb[]): Particle[] {
  const count = Math.min(maxParticles, Math.round((width * height) / areaPerParticle));
  return Array.from({ length: count }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.24,
    vy: (Math.random() - 0.5) * 0.24,
    radius: 0.9 + Math.random() * 1.5,
    color: palette[index % palette.length] ?? fallbackColor,
    phase: Math.random() * Math.PI * 2,
  }));
}

/**
 * Decorative constellation behind the homepage hero, drawn in the logo palette. It runs
 * only while visible, pauses with the tab, reacts to a fine pointer and renders a single
 * still frame under reduced motion. Browsers without a 2D canvas render nothing.
 */
export function ParticleField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let palette = readPalette(canvas);
    let dark = isDarkTheme();
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;
    let visible = true;
    const pointer = { x: 0, y: 0, active: false };

    const draw = (time: number, move: boolean) => {
      context.clearRect(0, 0, width, height);
      const dotAlpha = dark ? 0.95 : 0.8;
      const linkAlpha = dark ? 0.3 : 0.24;
      for (const particle of particles) {
        if (move) {
          if (pointer.active) {
            const dx = particle.x - pointer.x;
            const dy = particle.y - pointer.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0 && distance < pointerRadius) {
              const push = (1 - distance / pointerRadius) * 0.06;
              particle.vx += (dx / distance) * push;
              particle.vy += (dy / distance) * push;
            }
          }
          particle.vx *= 0.985;
          particle.vy *= 0.985;
          const speed = Math.hypot(particle.vx, particle.vy);
          if (speed < 0.08) {
            particle.vx += (Math.random() - 0.5) * 0.02;
            particle.vy += (Math.random() - 0.5) * 0.02;
          }
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x < -10) particle.x = width + 10;
          if (particle.x > width + 10) particle.x = -10;
          if (particle.y < -10) particle.y = height + 10;
          if (particle.y > height + 10) particle.y = -10;
        }
      }
      context.lineWidth = 1;
      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        if (!a) continue;
        for (let j = i + 1; j < particles.length; j += 1) {
          const b = particles[j];
          if (!b) continue;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance >= linkDistance) continue;
          context.strokeStyle = rgba(a.color, (1 - distance / linkDistance) * linkAlpha);
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
        if (pointer.active) {
          const distance = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (distance < pointerRadius) {
            context.strokeStyle = rgba(a.color, (1 - distance / pointerRadius) * linkAlpha * 1.8);
            context.beginPath();
            context.moveTo(a.x, a.y);
            context.lineTo(pointer.x, pointer.y);
            context.stroke();
          }
        }
        const twinkle = 0.65 + 0.35 * Math.sin(time / 900 + a.phase);
        context.fillStyle = rgba(a.color, dotAlpha * twinkle);
        context.beginPath();
        context.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
        context.fill();
      }
    };

    const tick = (time: number) => {
      draw(time, true);
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = () => {
      if (frame || !visible || document.hidden) return;
      if (reducedMotion.matches) {
        draw(0, false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      particles = seed(width, height, palette);
      draw(0, false);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active =
        pointer.x >= 0 && pointer.y >= 0 && pointer.x <= rect.width && pointer.y <= rect.height;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onMotionChange = () => {
      stop();
      start();
    };

    resize();
    start();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    const intersection =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
            if (visible) start();
            else stop();
          });
    intersection?.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      palette = readPalette(canvas);
      dark = isDarkTheme();
      particles = seed(width, height, palette);
      if (!frame) draw(0, false);
    });
    themeObserver.observe(document.documentElement, { attributeFilter: ["data-theme"] });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", onMotionChange);

    return () => {
      stop();
      resizeObserver?.disconnect();
      intersection?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", onMotionChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
    />
  );
}
