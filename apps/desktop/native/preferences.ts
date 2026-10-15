import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { DevicePreferences } from "./rpc";

const defaults: DevicePreferences = { theme: "system", locale: "system" };
export function parsePreferences(value: unknown): DevicePreferences {
  if (!value || typeof value !== "object") return { ...defaults };
  const input = value as Record<string, unknown>;
  return {
    theme: input.theme === "light" || input.theme === "dark" ? input.theme : "system",
    locale: input.locale === "en" || input.locale === "zh" ? input.locale : "system",
  };
}
export function createPreferenceStore(directory: string) {
  const file = join(directory, "preferences.json");
  let current: DevicePreferences;
  try {
    const source = readFileSync(file, "utf8");
    if (source.length > 4096) throw new Error("Invalid preference data");
    current = parsePreferences(JSON.parse(source));
  } catch {
    current = { ...defaults };
  }
  return {
    read: () => ({ ...current }),
    save(value: DevicePreferences) {
      const parsed = parsePreferences(value);
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(temporary, JSON.stringify(parsed), { mode: 0o600, flag: "wx" });
        renameSync(temporary, file);
        current = parsed;
        return true;
      } catch {
        return false;
      } finally {
        try {
          rmSync(temporary, { force: true });
        } catch {
          /* A failed cleanup must not break in-memory preferences. */
        }
      }
    },
    preload() {
      return `(()=>{try{const preferences=${JSON.stringify(current)};localStorage.setItem("theme",preferences.theme);localStorage.setItem("raypx_locale",preferences.locale);}catch{}})();`;
    },
  };
}
