import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "./catalog-store.js";
import { messages as staticCatalogs } from "../locales/index.js";
import en from "../locales/en/index.js";
import zh from "../locales/zh/index.js";

const lazyCatalogs = {
  en,
  zh: () => import("../locales/zh/index.js").then((module) => module.default),
};

describe("catalog store", () => {
  it("serves bundled catalogs immediately and loads split catalogs once", async () => {
    const load = vi.fn(async () => zh);
    const store = createCatalogStore({ en, zh: load });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot().loaded).toEqual({ en });
    const [first, second] = await Promise.all([store.load("zh"), store.load("zh")]);
    expect(first).toBe(zh);
    expect(second).toBe(zh);
    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot().loaded).toEqual({ en, zh });
  });

  it("returns one settled promise per catalog so use() reads it synchronously", async () => {
    const store = createCatalogStore({ en, zh: async () => zh });
    const bundled = store.load("en");
    expect(store.load("en")).toBe(bundled);
    expect(bundled).toMatchObject({ status: "fulfilled", value: en });
    const split = store.load("zh");
    expect(store.load("zh")).toBe(split);
    await split;
    expect(store.load("zh")).toBe(split);
    expect(split).toMatchObject({ status: "fulfilled", value: zh });
  });

  it("retries a catalog after its chunk fails", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(zh);
    const store = createCatalogStore({ en, zh: load });
    const first = store.load("zh");
    await expect(first).rejects.toThrow("offline");
    expect(store.read("zh")).toBe(first);
    expect(store.snapshot().failed.has("zh")).toBe(true);
    const retry = store.load("zh");
    expect(store.snapshot().failed.has("zh")).toBe(false);
    await expect(retry).resolves.toBe(zh);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bundles every catalog statically and keeps only the default in the lazy entry", async () => {
    expect(staticCatalogs).toEqual({ en, zh });
    expect(lazyCatalogs.en).toBe(en);
    expect(typeof lazyCatalogs.zh).toBe("function");
    await expect(createCatalogStore(lazyCatalogs).load("zh")).resolves.toEqual(zh);
  });
});
