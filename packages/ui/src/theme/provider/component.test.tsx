/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ThemeProvider, parseTheme, useTheme } from "../client";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
      <button onClick={() => setTheme("system")} type="button">
        System
      </button>
    </div>
  );
}

function createMediaQuery(matches: boolean) {
  return Object.assign(new window.EventTarget(), {
    matches,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
}

describe("theme provider", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    window.localStorage.clear();
    for (const cookie of document.cookie.split(";")) {
      document.cookie = `${cookie.split("=")[0]?.trim()}=; Path=/; Max-Age=0`;
    }
  });

  it("falls back when a stored theme is invalid", () => {
    expect(parseTheme("sepia", "dark")).toBe("dark");
    expect(parseTheme(null, "system")).toBe("system");
  });

  it("applies an explicit theme and supports switching without persistence", async () => {
    const user = userEvent.setup();
    const onThemeChange = vi.fn();
    render(
      <ThemeProvider
        disableScript
        disableTransitionOnChange
        initialTheme="dark"
        onThemeChange={onThemeChange}
        storageKey={false}
      >
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.querySelector("script")).toBeNull();
    expect(onThemeChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(onThemeChange).toHaveBeenCalledExactlyOnceWith("light");
  });

  it.each(["light", "system"] as const)(
    "hydrates with the server's %s theme before reconciling device storage",
    async (initialTheme) => {
      window.localStorage.setItem("theme", "dark");
      vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQuery(true));
      const onRecoverableError = vi.fn();
      const onThemeChange = vi.fn();
      const consoleError = vi.spyOn(console, "error");
      const rendered: string[] = [];
      function FirstRender() {
        rendered.push(useTheme().theme);
        return <ThemeProbe />;
      }
      const element = (
        <ThemeProvider disableScript initialTheme={initialTheme} onThemeChange={onThemeChange}>
          <FirstRender />
        </ThemeProvider>
      );
      const container = document.createElement("div");
      container.innerHTML = renderToString(element);
      document.body.append(container);

      expect(container.querySelector('[data-testid="theme"]')).toHaveTextContent(initialTheme);
      expect(container.querySelector('[data-testid="resolved-theme"]')).toHaveTextContent("light");
      rendered.length = 0;
      render(element, { container, hydrate: true, onRecoverableError });

      expect(rendered[0]).toBe(initialTheme);
      await waitFor(() => expect(screen.getByTestId("theme")).toHaveTextContent("dark"));
      expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
      expect(document.documentElement).toHaveAttribute("data-theme", "dark");
      expect(onThemeChange).not.toHaveBeenCalled();
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("reconciles storage keys and theme defaults when the provider props change", () => {
    localStorage.setItem("first-theme", "dark");
    localStorage.setItem("second-theme", "light");
    const { rerender } = render(
      <ThemeProvider disableScript storageKey="first-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");

    rerender(
      <ThemeProvider disableScript storageKey="second-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "first-theme", newValue: "dark" }));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    rerender(
      <ThemeProvider disableScript initialTheme="dark" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    rerender(
      <ThemeProvider disableScript initialTheme="light" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    rerender(
      <ThemeProvider disableScript defaultTheme="dark" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("cleans up storage and system subscriptions across StrictMode remounts", () => {
    const media = createMediaQuery(false);
    vi.spyOn(window, "matchMedia").mockReturnValue(media);
    const addStorageListener = vi.spyOn(window, "addEventListener");
    const removeStorageListener = vi.spyOn(window, "removeEventListener");
    const addMediaListener = vi.spyOn(media, "addEventListener");
    const removeMediaListener = vi.spyOn(media, "removeEventListener");
    const { unmount } = render(
      <StrictMode>
        <ThemeProvider disableScript initialTheme="system">
          <ThemeProbe />
        </ThemeProvider>
      </StrictMode>,
    );
    const storageListeners = addStorageListener.mock.calls
      .filter(([event]) => event === "storage")
      .map(([, listener]) => listener);
    expect(storageListeners.length).toBeGreaterThan(1);
    expect(addMediaListener.mock.calls.length).toBeGreaterThan(1);

    act(() => {
      media.matches = true;
      media.dispatchEvent(new window.Event("change"));
    });
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    unmount();

    expect(
      removeStorageListener.mock.calls
        .filter(([event]) => event === "storage")
        .map(([, listener]) => listener),
    ).toEqual(storageListeners);
    expect(removeMediaListener.mock.calls).toEqual(addMediaListener.mock.calls);
  });

  it("follows system changes only while the system theme is selected", async () => {
    const user = userEvent.setup();
    const media = createMediaQuery(true);
    const matchMedia = vi.spyOn(window, "matchMedia").mockReturnValue(media);

    render(
      <ThemeProvider disableScript initialTheme="system" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    act(() => {
      media.matches = false;
      media.dispatchEvent(new window.Event("change"));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    await user.click(screen.getByRole("button", { name: "Dark" }));
    act(() => {
      media.matches = true;
      media.dispatchEvent(new window.Event("change"));
      media.matches = false;
      media.dispatchEvent(new window.Event("change"));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    await user.click(screen.getByRole("button", { name: "System" }));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    matchMedia.mockRestore();
  });

  it("keeps the resolved theme and document in sync with another tab", () => {
    const storageKey = "raypx-test-theme";
    render(
      <ThemeProvider disableScript initialTheme="light" storageKey={storageKey}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    act(() => {
      window.localStorage.setItem(storageKey, "dark");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: storageKey,
          newValue: "dark",
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("retains choices when persistence fails and uses updated defaults for storage events", async () => {
    const user = userEvent.setup();
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(document, "cookie", "set").mockImplementation(() => {
      throw new Error("cookies unavailable");
    });

    const { rerender } = render(
      <ThemeProvider
        defaultTheme="light"
        disableScript
        initialTheme="light"
        storageKey="raypx-test-theme"
      >
        <ThemeProbe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    rerender(
      <ThemeProvider
        defaultTheme="light"
        disableScript
        initialTheme="light"
        storageKey="raypx-test-theme"
      >
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    rerender(
      <ThemeProvider
        defaultTheme="system"
        disableScript
        initialTheme="light"
        storageKey="raypx-test-theme"
      >
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "raypx-test-theme",
          newValue: "sepia",
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
