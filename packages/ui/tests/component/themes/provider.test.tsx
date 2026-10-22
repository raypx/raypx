/** @vitest-environment jsdom */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  ThemePicker,
  ThemeProvider,
  parseTheme,
  readStoredTheme,
  readThemeCookie,
  storeTheme,
  themeColors,
  useTheme,
} from "../../../src/themes";

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
    for (const meta of document.head.querySelectorAll('meta[name="theme-color"]')) meta.remove();
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
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    render(
      <ThemeProvider initialTheme="dark" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark"));
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(document.querySelector("script")).toBeNull();
    expect(meta).toHaveAttribute("content", themeColors.dark);

    await user.click(screen.getByRole("button", { name: "Light" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(meta).toHaveAttribute("content", themeColors.light);
  });

  it.each(["light", "system"] as const)(
    "hydrates with the server's %s theme before reconciling device storage",
    async (initialTheme) => {
      window.localStorage.setItem("theme", "dark");
      vi.spyOn(window, "matchMedia").mockReturnValue(createMediaQuery(true));
      const onRecoverableError = vi.fn();
      const consoleError = vi.spyOn(console, "error");
      const rendered: string[] = [];
      function FirstRender() {
        rendered.push(useTheme().theme);
        return <ThemeProbe />;
      }
      const element = (
        <ThemeProvider initialTheme={initialTheme}>
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
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    },
  );

  it("reconciles storage keys and theme defaults when the provider props change", () => {
    localStorage.setItem("first-theme", "dark");
    localStorage.setItem("second-theme", "light");
    const { rerender } = render(
      <ThemeProvider storageKey="first-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");

    rerender(
      <ThemeProvider storageKey="second-theme">
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "first-theme", newValue: "dark" }));
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    rerender(
      <ThemeProvider initialTheme="dark" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    rerender(
      <ThemeProvider initialTheme="light" storageKey={false}>
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
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
        <ThemeProvider initialTheme="system">
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
      <ThemeProvider initialTheme="system" storageKey={false}>
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
      <ThemeProvider initialTheme="light" storageKey={storageKey}>
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

  it("retains choices when persistence fails and falls back to the initial theme for invalid events", async () => {
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
    const element = (
      <ThemeProvider initialTheme="light" storageKey="raypx-test-theme">
        <ThemeProbe />
      </ThemeProvider>
    );

    const { rerender } = render(element);
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("dark");
    rerender(element);
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "raypx-test-theme",
          newValue: "sepia",
          storageArea: localStorage,
        }),
      );
    });
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(screen.getByTestId("resolved-theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");

    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("reads only valid theme cookies", () => {
    expect(readThemeCookie("locale=zh; theme=dark")).toBe("dark");
    expect(readThemeCookie("theme=sepia")).toBeNull();
    expect(readThemeCookie("custom=light", "custom")).toBe("light");
    expect(readThemeCookie(null)).toBeNull();
  });

  it("lets ThemePicker drive the provider without controlled props", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider initialTheme="light" storageKey={false}>
        <ThemePicker label="Theme" labels={{ light: "Light", dark: "Dark", system: "System" }} />
        <ThemeProbe />
      </ThemeProvider>,
    );
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("stores and reads preferences outside the provider", () => {
    storeTheme("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(readThemeCookie(document.cookie)).toBe("dark");
    expect(readStoredTheme()).toBe("dark");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readStoredTheme("light")).toBe("dark");
    expect(readStoredTheme("light", "missing-theme")).toBe("light");
  });
});
