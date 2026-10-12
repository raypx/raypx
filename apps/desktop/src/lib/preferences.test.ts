/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const storageKey = "voidmix.desktop.preferences";

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

afterEach(() => vi.restoreAllMocks());

describe("desktop preferences", () => {
  it("keeps the prerendered defaults until the shell restores saved preferences", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ state: { theme: "light", syncPaused: true }, version: 1 }),
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    expect(store.getState().theme).toBe("dark");
    expect(store.persist.hasHydrated()).toBe(false);
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({
      theme: "light",
      syncPaused: true,
      automaticDownloads: true,
    });
    expect(store.persist.hasHydrated()).toBe(true);
  });

  it("persists preferences and restores them in a fresh renderer store", async () => {
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    store.getState().toggleTheme();
    store.getState().togglePreference("startWithSystem");
    store.getState().togglePreference("syncPaused");
    const saved = JSON.parse(localStorage.getItem(storageKey)!);
    expect(saved).toEqual({
      version: 1,
      state: {
        theme: "light",
        syncPaused: true,
        startWithSystem: true,
        meteredNetworks: false,
        automaticDownloads: true,
        transferSummaries: true,
        workspaceChanges: true,
      },
    });

    vi.resetModules();
    const { useDesktopPreferences: restored } = await import("./preferences");
    await restored.persist.rehydrate();
    expect(restored.getState()).toMatchObject(saved.state);
  });

  it("preserves a theme saved by the previous desktop implementation", async () => {
    localStorage.setItem("voidmix.desktop.theme", "light");
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState().theme).toBe("light");
  });

  it("ignores invalid persisted fields and never replaces actions from storage", async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          theme: "sepia",
          syncPaused: "true",
          automaticDownloads: false,
          toggleTheme: "not-an-action",
        },
        version: 1,
      }),
    );
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({
      theme: "dark",
      syncPaused: false,
      automaticDownloads: false,
    });
    expect(store.getState().toggleTheme).toBeTypeOf("function");
  });

  it("keeps defaults when persisted JSON is corrupt", async () => {
    localStorage.setItem(storageKey, "invalid json");
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({ theme: "dark", syncPaused: false });
  });

  it("keeps in-memory controls working when browser storage is blocked", async () => {
    const denied = () => {
      throw new Error("Storage access denied");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(denied);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(denied);
    const { useDesktopPreferences: store } = await import("./preferences");
    await store.persist.rehydrate();
    expect(() => {
      store.getState().toggleTheme();
      store.getState().togglePreference("syncPaused");
    }).not.toThrow();
    expect(store.getState()).toMatchObject({ theme: "light", syncPaused: true });
  });
});
