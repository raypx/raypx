/** @vitest-environment jsdom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ThemeProvider, parseTheme, useTheme } from "..";

afterEach(() => cleanup());

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button onClick={() => setTheme("dark")} type="button">
        Dark
      </button>
      <button onClick={() => setTheme("light")} type="button">
        Light
      </button>
    </div>
  );
}

describe("theme provider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    window.localStorage.clear();
  });

  it("falls back when a stored theme is invalid", () => {
    expect(parseTheme("sepia", "dark")).toBe("dark");
    expect(parseTheme(null, "system")).toBe("system");
  });

  it("applies an explicit theme and supports switching without persistence", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider disableScript disableTransitionOnChange initialTheme="dark" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.querySelector("script")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("resolves system theme from the media query", async () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(
      () =>
        ({
          matches: true,
          media: "(prefers-color-scheme: dark)",
          onchange: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );

    render(
      <ThemeProvider disableScript initialTheme="system" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    matchMedia.mockRestore();
  });

  it("keeps switching usable when localStorage is unavailable", async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    render(
      <ThemeProvider disableScript initialTheme="light" storageKey="voidmix-test-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
