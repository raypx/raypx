import { describe, expect, it, vi } from "vite-plus/test";
import { createCatalogStore } from "./catalog-store.ts";
import { catalogs as lazyCatalogs } from "./catalogs/lazy.ts";
import { catalogs as staticCatalogs } from "./catalogs/static.ts";
import en from "./messages/en.ts";
import zh from "./messages/zh.ts";

describe("catalog store", () => {
  it("serves bundled catalogs immediately and loads split catalogs once", async () => {
    const load = vi.fn(async () => zh);
    const store = createCatalogStore({ en, zh: load });
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.snapshot()).toEqual({ en });
    const [first, second] = await Promise.all([store.load("zh"), store.load("zh")]);
    expect(first).toBe(zh);
    expect(second).toBe(zh);
    expect(load).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual({ en, zh });
  });

  it("retries a catalog after its chunk fails", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(zh);
    const store = createCatalogStore({ en, zh: load });
    await expect(store.load("zh")).rejects.toThrow("offline");
    await expect(store.load("zh")).resolves.toBe(zh);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bundles every catalog statically and keeps only the default in the lazy entry", async () => {
    expect(staticCatalogs).toEqual({ en, zh });
    expect(lazyCatalogs.en).toBe(en);
    expect(typeof lazyCatalogs.zh).toBe("function");
    await expect(createCatalogStore(lazyCatalogs).load("zh")).resolves.toEqual(zh);
  });
});
