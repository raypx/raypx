import { describe, expect, it } from "vitest";
import { themeTokens, type ThemeToken } from "./tokens.js";

function luminance(color: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error(`Expected a resolved sRGB color: ${color}`);
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

for (const mode of ["light", "dark"] as const) {
  describe(`${mode} shared colors`, () => {
    const tokens = themeTokens[mode];
    function resolve(key: ThemeToken): string {
      const color = tokens[key];
      const reference = /^var\(--([a-z0-9-]+)\)$/.exec(color)?.[1];
      return reference ? resolve(reference as ThemeToken) : color;
    }
    function expectContrast(text: ThemeToken, surface: ThemeToken) {
      const a = luminance(resolve(text)),
        b = luminance(resolve(surface));
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        `${text} on ${surface}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    it("keeps body, muted and action text readable across neutral surfaces", () => {
      expect.hasAssertions();
      for (const text of ["foreground", "muted-foreground", "primary"] as const)
        for (const surface of ["background", "sidebar", "card", "popover", "muted"] as const)
          expectContrast(text, surface);
      expectContrast("primary-foreground", "primary");
      expectContrast("primary-foreground", "primary-hover");
      expectContrast("selected-text", "selected");
      expectContrast("ring", "background");
      expectContrast("ring", "popover");
    });
    it("keeps status labels and card links readable on their own tints", () => {
      expect.hasAssertions();
      for (const role of ["success", "warning", "danger", "info"] as const)
        expectContrast(`${role}-text`, `${role}-bg`);
      expectContrast("primary", "success-bg");
      expectContrast("primary", "warning-bg");
      expectContrast("muted-foreground", "warning-bg");
    });
    it("keeps all eight identity names readable as text and avatar tints", () => {
      expect.hasAssertions();
      for (let i = 1; i <= 8; i++) {
        expectContrast(`identity-${i}` as ThemeToken, "background");
        expectContrast(`identity-${i}` as ThemeToken, `identity-${i}-bg` as ThemeToken);
      }
    });
  });
}
