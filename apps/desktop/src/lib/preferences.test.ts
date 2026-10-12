/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storageKey = "raypx.desktop.preferences";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("desktop theme preferences", () => {
  it("restores the theme after hydration and drops retired saved preferences", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: { theme: "light", syncPaused: true, startWithSystem: true },
        version: 1,
      }),
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    expect(store.getState().theme).toBe("dark");
    expect(store.persist.hasHydrated()).toBe(false);
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("light");
    expect(store.getState()).not.toHaveProperty("syncPaused");
    expect(store.getState()).not.toHaveProperty("startWithSystem");
    expect(store.persist.hasHydrated()).toBe(true);
    store.getState().toggleTheme();
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      version: 1,
      state: { theme: "dark" },
    });
  });

  it("persists the theme and restores it in a fresh renderer store", async () => {
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    store.getState().toggleTheme();
    const saved = JSON.parse(localStorage.getItem(storageKey)!);
    expect(saved).toEqual({ version: 1, state: { theme: "light" } });

    vi.resetModules();
    const { useDesktopPreferences: restored } = await import("./preferences");
    await restored.persist.rehydrate();
    expect(restored.getState()).toMatchObject(saved.state);
  });

  it("preserves a theme saved by the previous desktop implementation", async () => {
    localStorage.setItem("raypx.desktop.theme", "light");
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("light");
  });

  it.each(["preferences", "theme"])("migrates the previous brand's %s key", async (format) => {
    localStorage.setItem(
      `voidmix.desktop.${format}`,
      format === "preferences"
        ? JSON.stringify({ state: { theme: "light", syncPaused: true }, version: 1 })
        : "light",
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("light");
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      state: { theme: "light" },
      version: 1,
    });
  });

  it("preserves current preferences when the previous brand's settings are different", async () => {
    localStorage.setItem(storageKey, JSON.stringify({ state: { theme: "dark" }, version: 1 }));
    localStorage.setItem(
      "voidmix.desktop.preferences",
      JSON.stringify({ state: { theme: "light" }, version: 1 }),
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("dark");
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
      state: { theme: "dark" },
      version: 1,
    });
  });

  it("restores the previous theme when migration writes are blocked", async () => {
    localStorage.setItem("voidmix.desktop.theme", "light");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage writes denied");
    });
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("light");
  });

  it("ignores invalid persisted fields and never replaces actions from storage", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: { theme: "sepia", toggleTheme: "not-an-action" },
        version: 1,
      }),
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("dark");
    expect(store.getState().toggleTheme).toBeTypeOf("function");
  });

  it("keeps defaults when persisted JSON is corrupt", async () => {
    localStorage.setItem(storageKey, "invalid json");
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("dark");
  });

  it("keeps in-memory theme controls working when browser storage is blocked", async () => {
    const denied = () => {
      throw new Error("Storage access denied");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(() => store.getState().toggleTheme()).not.toThrow();
    expect(store.getState().theme).toBe("light");
  });
});
