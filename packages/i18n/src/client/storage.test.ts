import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { LOCALE_STORAGE_KEY } from "../constants";
import { createLocalStorageLocaleStorage } from "./storage";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("locale storage brand migration", () => {
  it("restores the previous locale and saves the new key", () => {
    localStorage.setItem("voidmix_locale", "zh");
    expect(createLocalStorageLocaleStorage().read()).toBe("zh");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh");
  });

  it.each(["en", "invalid"])("keeps an existing new key: %s", (current) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, current);
    localStorage.setItem("voidmix_locale", "zh");
    expect(createLocalStorageLocaleStorage().read()).toBe(current === "en" ? "en" : undefined);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe(current);
  });

  it("ignores an invalid old locale", () => {
    localStorage.setItem("voidmix_locale", "invalid");
    expect(createLocalStorageLocaleStorage().read()).toBeUndefined();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("restores the previous locale when migration writes are blocked", () => {
    localStorage.setItem("voidmix_locale", "zh");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage writes denied");
    });
    expect(createLocalStorageLocaleStorage().read()).toBe("zh");
  });
});
