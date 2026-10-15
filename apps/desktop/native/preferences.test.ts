import { describe, expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPreferenceStore } from "./preferences";

describe("native device preferences", () => {
  it("restores validated preferences independently of WebView storage", () => {
    const dir = mkdtempSync(join(tmpdir(), "raypx-native-prefs-"));
    try {
      const store = createPreferenceStore(dir);
      expect(store.read()).toEqual({ theme: "system", locale: "system" });
      expect(store.save({ theme: "dark", locale: "zh" })).toBe(true);
      expect(createPreferenceStore(dir).read()).toEqual({ theme: "dark", locale: "zh" });
      writeFileSync(join(dir, "preferences.json"), '{"theme":"invalid","locale":"fr"}');
      expect(createPreferenceStore(dir).read()).toEqual({ theme: "system", locale: "system" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
