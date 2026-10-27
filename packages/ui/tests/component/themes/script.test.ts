/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { themeColors } from "../../../src/themes/config";
import { createThemeScript } from "../../../src/themes/script";

function run(script: string) {
  // oxlint-disable-next-line typescript/no-implied-eval -- Executes the generated pre-paint script under test.
  new Function(script)();
  const root = document.documentElement;
  return {
    theme: root.dataset.theme,
    classes: [...root.classList],
    scheme: root.style.colorScheme,
  };
}

function mockSystemDark(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media: string) => ({ matches, media }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.documentElement.className = "";
  delete document.documentElement.dataset.theme;
  for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
});

describe("createThemeScript", () => {
  it("applies the stored theme and replaces stale classes", () => {
    document.documentElement.classList.add("light");
    localStorage.setItem("theme", "dark");
    expect(run(createThemeScript())).toEqual({ theme: "dark", classes: ["dark"], scheme: "dark" });
  });

  it("resolves system and unknown values from the media query", () => {
    mockSystemDark(true);
    localStorage.setItem("theme", "sepia");
    expect(run(createThemeScript()).theme).toBe("dark");
  });

  it("prefers an application source and falls back to storage when it yields nothing", () => {
    localStorage.setItem("theme", "dark");
    expect(run(createThemeScript({ initialThemeSource: '"light"' })).theme).toBe("light");
    expect(run(createThemeScript({ initialThemeSource: "undefined" })).theme).toBe("dark");
  });

  it("syncs the browser theme-color meta", () => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = themeColors.light;
    document.head.append(meta);
    localStorage.setItem("theme", "dark");
    run(createThemeScript());
    expect(meta.content).toBe(themeColors.dark);
  });

  it("creates the theme-color meta once when the document has none", () => {
    localStorage.setItem("theme", "dark");
    run(createThemeScript());
    run(createThemeScript());
    const metas = document.head.querySelectorAll('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]).toHaveAttribute("content", themeColors.dark);
  });

  it("ignores storage when persistence is disabled", () => {
    mockSystemDark(false);
    localStorage.setItem("theme", "dark");
    expect(run(createThemeScript({ storageKey: false })).theme).toBe("light");
  });
});
