import { describe, expect, it } from "vite-plus/test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreferenceStore } from "./preferences";
import { DEVICE_PREFERENCES_KEY } from "../preferences";
import { runInNewContext } from "node:vm";

describe("native device preferences", () => {
  it("restores validated preferences independently of WebView storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "raypx-native-prefs-"));
    try {
      const store = createPreferenceStore(dir);
      expect(store.read()).toEqual({ theme: "system", locale: "system" });
      expect(store.snapshot().status).toBe("missing");
      expect(store.save({ theme: "dark", locale: "zh" })).toBe(true);
      expect(createPreferenceStore(dir).read()).toEqual({ theme: "dark", locale: "zh" });
      expect(createPreferenceStore(dir).snapshot().status).toBe("valid");
      writeFileSync(join(dir, "preferences.json"), '{"theme":"invalid","locale":"fr"}');
      expect(createPreferenceStore(dir).read()).toEqual({ theme: "system", locale: "system" });
      expect(createPreferenceStore(dir).snapshot().status).toBe("error");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["malformed JSON", "{broken"],
    ["null", "null"],
    ["an array", "[]"],
    ["a missing field", '{"theme":"dark"}'],
    ["an oversized file", " ".repeat(4097)],
  ])("keeps invalid files distinct from a missing file: %s", (_name, source) => {
    const dir = mkdtempSync(join(tmpdir(), "raypx-native-prefs-"));
    try {
      writeFileSync(join(dir, "preferences.json"), source);
      expect(createPreferenceStore(dir).snapshot()).toEqual({
        status: "error",
        preferences: { theme: "system", locale: "system" },
      });
      expect(readFileSync(join(dir, "preferences.json"), "utf8")).toBe(source);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("publishes its snapshot without reading or writing WebView storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "raypx-native-prefs-"));
    try {
      const store = createPreferenceStore(dir);
      store.save({ theme: "dark", locale: "zh" });
      const window: Record<string, unknown> = {};
      const context = {
        window,
        get localStorage() {
          throw new Error("storage unavailable");
        },
      };
      runInNewContext(store.preload(), context);
      expect(window[DEVICE_PREFERENCES_KEY]).toEqual(store.snapshot());
      expect(Object.isFrozen(window[DEVICE_PREFERENCES_KEY])).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves unrelated fields and leaves the last good state intact on a failed atomic write", () => {
    const dir = mkdtempSync(join(tmpdir(), "raypx-native-prefs-"));
    const file = join(dir, "preferences.json");
    try {
      writeFileSync(file, JSON.stringify({ theme: "dark", locale: "zh", other: { keep: true } }));
      const store = createPreferenceStore(dir);
      expect(store.save({ theme: "light", locale: "en" })).toBe(true);
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
        theme: "light",
        locale: "en",
        other: { keep: true },
      });
      rmSync(file);
      mkdirSync(file);
      expect(createPreferenceStore(dir).snapshot().status).toBe("error");
      expect(store.save({ theme: "dark", locale: "zh" })).toBe(false);
      expect(store.snapshot()).toEqual({
        status: "valid",
        preferences: { theme: "light", locale: "en" },
      });
      expect(readdirSync(dir)).toEqual(["preferences.json"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
