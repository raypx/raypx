const loopMs = 8_000;
const tau = 2 * Math.PI;
const sides = [
  { mirror: false, offset: 0, colors: ["--brand-sky", "--brand-blue"] },
  { mirror: true, offset: 0.47, colors: ["--brand-pink", "--brand-violet"] },
] as const;

type Pointer = { x: number; y: number };
type Point = { x: number; y: number; t: number; radius: number; weight: number };
type Track = { color: string; spread: number; points: Point[] };

function fraction(value: number) {
  return value - Math.floor(value);
}

function smooth(start: number, end: number, value: number) {
  const unit = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return unit * unit * (3 - 2 * unit);
}

function curve(a: number, b: number, c: number, d: number, t: number) {
  const u = 1 - t;
  return u ** 3 * a + 3 * u ** 2 * t * b + 3 * u * t ** 2 * c + t ** 3 * d;
}

function dot(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
) {
  context.globalAlpha = alpha;
  context.beginPath();
  context.arc(x, y, radius, 0, tau);
  context.fill();
}

function makeTracks(
  width: number,
  top: number,
  frameWidth: number,
  palette: CSSStyleDeclaration,
  side: (typeof sides)[number],
): Track[] {
  const narrow = width < 640;
  const rows = narrow ? 7 : 9;
  const columns = narrow ? 48 : 70;
  const focus = (width - frameWidth) / 2 + frameWidth * (narrow ? 0.12 : 0.17);
  return Array.from({ length: rows }, (_, row) => {
    const spread = (row + 0.5) / rows - 0.5;
    const color = palette.getPropertyValue(side.colors[spread < 0 ? 0 : 1]).trim();
    const points = Array.from({ length: columns }, (_point, column) => {
      const seed = fraction(Math.sin((row + 1) * 69.7 + column * 18.9) * 43_267);
      const t = (column + seed * 0.58) / columns;
      const x = curve(
        width * ((narrow ? -0.055 : 0.04) + spread * 0.13),
        width * (0.215 + spread * 0.155),
        width * (0.042 + spread * 0.08),
        focus + spread * width * 0.026,
        t,
      );
      return {
        x: side.mirror ? width - x : x,
        y: curve(
          top * ((narrow ? 0.48 : 0.26) + spread * 0.3),
          top * (0.22 + spread * 0.48),
          top * (1.07 + spread * 0.33),
          top + spread * 10,
          t,
        ),
        t,
        radius: (0.65 + seed * 0.68) * (narrow ? 0.84 : 1),
        weight: smooth(0, 0.16, t) * (1 - smooth(0.8, 1, t) * 0.82),
      };
    });
    return { color, spread, points };
  });
}

/** The two paths and their border lights share the eight-second MotionHarness timeline. */
export function prepareHeroTrails(
  context: CanvasRenderingContext2D,
  light: HTMLElement,
  width: number,
  height: number,
  frameTop: number,
  frameWidth: number,
  ratio: number,
) {
  const base = document.createElement("canvas");
  base.width = context.canvas.width;
  base.height = context.canvas.height;
  const staticContext = base.getContext("2d");
  if (!staticContext) return;
  staticContext.scale(ratio, ratio);
  const palette = getComputedStyle(light);
  const dark = document.documentElement.dataset.theme === "dark";
  const tracks = sides.map((side) => makeTracks(width, frameTop, frameWidth, palette, side));

  for (const group of tracks) {
    for (const track of group) {
      staticContext.fillStyle = track.color;
      for (const point of track.points) {
        dot(staticContext, point.x, point.y, point.radius, point.weight * (dark ? 0.25 : 0.3));
      }
    }
  }

  return (elapsed: number, still: boolean, pointer: Pointer | null) => {
    context.globalAlpha = 1;
    context.clearRect(0, 0, width, height);
    context.drawImage(base, 0, 0, width, height);
    if (still) {
      light.style.removeProperty("--hero-frame-light");
      return;
    }

    const lights: string[] = [];
    for (const [index, side] of sides.entries()) {
      const cycle = fraction(elapsed / loopMs + side.offset);
      const leading = cycle * 2.43 - 0.16;
      for (const track of tracks[index] ?? []) {
        context.fillStyle = track.color;
        for (const point of track.points) {
          const wake = leading - point.t + track.spread * 0.17;
          const packet = smooth(-0.035, 0.045, wake) * (1 - smooth(0.055, 0.25, wake));
          if (!pointer && packet < 0.02) continue;
          const proximity = pointer
            ? 1 - smooth(0, 90, Math.hypot(point.x - pointer.x, point.y - pointer.y))
            : 0;
          const highlight = Math.min(1, packet + 0.65 * proximity);
          if (highlight < 0.02) continue;
          const drift = Math.sin(tau * (cycle + point.t * 1.28 + track.spread * 0.31));
          const y = point.y + drift * Math.sin(Math.PI * point.t) * 2.6 * packet;
          dot(context, point.x, y, point.radius + highlight * 0.7, highlight * point.weight * 0.78);
        }
      }

      const alpha = smooth(0.44, 0.54, cycle) * (1 - smooth(0.58, 0.76, cycle));
      if (alpha < 0.01) continue;
      const start = width < 640 ? 12 : 17;
      const x = start + (46 - start) * smooth(0.48, 0.71, cycle);
      const center = side.mirror ? 100 - x : x;
      const color = `color-mix(in srgb, var(${side.colors[1]}) ${Math.round(alpha * 86)}%, transparent)`;
      lights.push(
        `radial-gradient(ellipse 18% 100% at ${center.toFixed(2)}% 0, ${color}, transparent)`,
      );
    }
    if (lights.length) light.style.setProperty("--hero-frame-light", lights.join(","));
    else light.style.removeProperty("--hero-frame-light");
  };
}
