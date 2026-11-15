import type { Page } from "@playwright/test";

/** Convert the browser's actual resolved CSS colors to sRGB and measure WCAG contrast. */
export async function measureTheme(page: Page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const probe = document.createElement("span");
    document.body.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    function color(token: string) {
      probe.style.color = `var(--${token})`;
      const css = getComputedStyle(probe).color;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const rgba = Array.from(ctx.getImageData(0, 0, 1, 1).data);
      return {
        source: root.getPropertyValue(`--${token}`).trim(),
        css,
        hex:
          "#" +
          rgba
            .slice(0, 3)
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
        rgba,
      };
    }
    const keys = [
      "background",
      "sidebar",
      "card",
      "popover",
      "muted",
      "border",
      "input",
      "foreground",
      "muted-foreground",
      "primary",
      "primary-foreground",
      "primary-hover",
      "control-ring",
      "ring",
      "selected",
      "selected-text",
      ...["success", "warning", "danger", "info"].flatMap((s) => [
        s + "-bg",
        s + "-border",
        s + "-text",
      ]),
      ...Array.from({ length: 8 }, (_, i) => [`identity-${i + 1}`, `identity-${i + 1}-bg`]).flat(),
    ];
    const tokens = Object.fromEntries(keys.map((k) => [k, color(k)]));
    function luminance(rgb: number[]) {
      const linear = rgb.map((n) => {
        const v = n / 255;
        return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
    }
    function contrast(text: string, surface: string) {
      const rawBackground = tokens[surface]!.rgba;
      const base = tokens.background!.rgba;
      const backgroundAlpha = (rawBackground[3] ?? 255) / 255;
      const bg = rawBackground
        .slice(0, 3)
        .map((n, i) => n * backgroundAlpha + base[i]! * (1 - backgroundAlpha));
      const fg = tokens[text]!.rgba;
      const alpha = (fg[3] ?? 255) / 255;
      const rgb = fg.slice(0, 3).map((n, i) => n * alpha + bg[i]! * (1 - alpha));
      const a = luminance(rgb),
        b = luminance(bg.slice(0, 3));
      return {
        text,
        surface,
        ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100,
      };
    }
    const ratios = [
      ...["foreground", "muted-foreground", "primary"].flatMap((text) =>
        ["background", "sidebar", "card", "popover", "muted"].map((surface) =>
          contrast(text, surface),
        ),
      ),
      contrast("primary-foreground", "primary"),
      contrast("primary-foreground", "primary-hover"),
      contrast("control-ring", "background"),
      contrast("control-ring", "card"),
      contrast("primary", "success-bg"),
      contrast("primary", "warning-bg"),
      contrast("muted-foreground", "warning-bg"),
      contrast("selected-text", "selected"),
      ...["success", "warning", "danger", "info"].map((s) => contrast(s + "-text", s + "-bg")),
      ...Array.from({ length: 8 }, (_, i) => [
        contrast(`identity-${i + 1}`, "background"),
        contrast(`identity-${i + 1}`, `identity-${i + 1}-bg`),
      ]).flat(),
    ];
    probe.remove();
    return { tokens, ratios };
  });
}
