import { describe, expect, it, vi } from "vite-plus/test";
import { LOCALE_PREFERENCE_KEY } from "@raypx/i18n/preferences";
import { THEME_STORAGE_KEY } from "@raypx/ui/theme";
import { createPreferenceStore } from "./preference-store";

describe("Mobile device preferences", () => {
  it("hydrates by key before exposing preferences", async () => {
    const store = createPreferenceStore({
      multiGet: vi.fn(
        async () =>
          [
            [LOCALE_PREFERENCE_KEY, "zh"],
            [THEME_STORAGE_KEY, "dark"],
          ] as const,
      ),
      setItem: vi.fn(),
    });
    await expect(store.read()).resolves.toEqual({ theme: "dark", locale: "zh" });
  });

  it("uses safe defaults when storage fails or values are invalid", async () => {
    const multiGet = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce([
        [THEME_STORAGE_KEY, "invalid"],
        [LOCALE_PREFERENCE_KEY, "fr"],
      ]);
    const store = createPreferenceStore({ multiGet, setItem: vi.fn() });
    await expect(store.read()).resolves.toEqual({ theme: "system", locale: "system" });
    await expect(store.read()).resolves.toEqual({ theme: "system", locale: "system" });
  });

  it("serializes rapid changes so the final selection is persisted last", async () => {
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const setItem = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const store = createPreferenceStore({ multiGet: vi.fn(), setItem });
    const one = store.writeLocale("en");
    const two = store.writeLocale("zh");
    const three = store.writeTheme("dark");
    await Promise.resolve();
    await Promise.resolve();
    expect(setItem.mock.calls).toEqual([[LOCALE_PREFERENCE_KEY, "en"]]);
    release();
    await Promise.all([one, two, three]);
    expect(setItem.mock.calls).toEqual([
      [LOCALE_PREFERENCE_KEY, "en"],
      [LOCALE_PREFERENCE_KEY, "zh"],
      [THEME_STORAGE_KEY, "dark"],
    ]);
  });

  it("continues with the newest selection after an earlier write rejects", async () => {
    const setItem = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValueOnce(undefined);
    const store = createPreferenceStore({ multiGet: vi.fn(), setItem });
    const failed = store.writeLocale("en");
    const latest = store.writeLocale("zh");
    await expect(failed).rejects.toThrow("unavailable");
    await expect(latest).resolves.toBeUndefined();
    expect(setItem).toHaveBeenLastCalledWith(LOCALE_PREFERENCE_KEY, "zh");
  });
});
