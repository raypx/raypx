import { describe, expect, it } from "vitest";
import { createSidebarStore, safeSidebarStorage, sidebarStorageKey } from "./sidebar.js";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe("workspace sidebar device state", () => {
  it("persists only device preferences in the origin/account scope and retains them across logout", async () => {
    const device = storage();
    const first = createSidebarStore("https://one.test", "alice", device);
    await first.persist.rehydrate();
    first.getState().setCollapsed("groups", true);
    first.getState().setOpen(false);
    first.getState().select({ spaceId: "space", agentId: "agent" });
    first.getState().setScrollTop(150);
    const saved = JSON.parse(device.values.get(sidebarStorageKey("https://one.test", "alice"))!);
    expect(saved.state).toEqual({ collapsed: { groups: true }, open: false });
    const restored = createSidebarStore("https://one.test", "alice", device);
    await restored.persist.rehydrate();
    expect(restored.getState()).toMatchObject({
      open: false,
      collapsed: { groups: true },
      spaceId: null,
      scrollTop: 0,
    });
  });

  it("resets transient state and selects isolated preferences when account or origin changes", async () => {
    const device = storage();
    const store = createSidebarStore("https://one.test", "alice", device);
    await store.persist.rehydrate();
    store.getState().setOpen(false);
    store.getState().setCollapsed("agents", true);
    store.getState().select({ spaceId: "private", agentId: "agent" });
    store.getState().setSheetOpen(true);
    store.getState().setScrollTop(90);
    store.getState().setRoute("/pages");
    store.getState().reset("https://one.test", "bob");
    expect(store.getState()).toMatchObject({
      accountId: "bob",
      spaceId: null,
      agentId: null,
      route: "",
      scrollTop: 0,
      sheetOpen: false,
      collapsed: {},
      open: true,
    });
    store.getState().setCollapsed("recent", true);
    store.getState().reset("https://two.test", "bob");
    expect(store.getState().collapsed).toEqual({});
    store.getState().reset("https://one.test", "alice");
    expect(store.getState()).toMatchObject({ open: false, collapsed: { agents: true } });
    store.getState().reset("https://one.test", "bob");
    expect(store.getState().collapsed).toEqual({ recent: true });
  });

  it("keeps rendering and updates usable when device storage throws", async () => {
    const device = safeSidebarStorage(() => {
      throw new Error("Storage denied");
    });
    const store = createSidebarStore("https://one.test", "alice", device);
    await store.persist.rehydrate();
    expect(() => {
      store.getState().setCollapsed("space", true);
      store.getState().setOpen(false);
      store.getState().reset("https://two.test", "alice");
    }).not.toThrow();
    expect(store.getState().open).toBe(true);
  });

  it("ignores unsupported persisted versions", async () => {
    const device = storage();
    device.setItem(
      sidebarStorageKey("https://one.test", "alice"),
      JSON.stringify({ version: 9, state: { open: false } }),
    );
    const store = createSidebarStore("https://one.test", "alice", device);
    await store.persist.rehydrate();
    expect(store.getState().open).toBe(true);
  });

  it("keeps saved preferences through pre-hydration selection and accepts no persisted server or selection data", async () => {
    const device = storage();
    device.setItem(
      sidebarStorageKey("https://one.test", "alice"),
      JSON.stringify({
        version: 1,
        state: {
          open: false,
          collapsed: { groups: true },
          spaceId: "untrusted",
          recentOrder: ["untrusted"],
        },
      }),
    );
    const store = createSidebarStore("https://one.test", "alice", device);
    store.getState().select({ spaceId: "current" });
    await store.persist.rehydrate();
    expect(store.getState()).toMatchObject({
      open: false,
      collapsed: { groups: true },
      spaceId: "current",
      recentOrder: [],
    });
  });
});
