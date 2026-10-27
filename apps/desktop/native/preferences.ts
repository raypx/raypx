import { isAnalyticsConsent, type AnalyticsConsent } from "@raypx/analytics";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  DEFAULT_DEVICE_PREFERENCES,
  DEVICE_PREFERENCES_KEY,
  isDevicePreferences,
  parsePreferences,
  type DevicePreferences,
  type PreferenceSnapshot,
} from "../preferences";

export function createPreferenceStore(directory: string) {
  const file = join(directory, "preferences.json");
  let current: DevicePreferences = { ...DEFAULT_DEVICE_PREFERENCES };
  let fields: Record<string, unknown> = {};
  let status: PreferenceSnapshot["status"];
  try {
    const source = readFileSync(file, "utf8");
    if (source.length > 4096) throw new Error("Invalid preference data");
    const value: unknown = JSON.parse(source);
    if (!isDevicePreferences(value)) throw new Error("Invalid preference data");
    fields = value as unknown as Record<string, unknown>;
    current = parsePreferences(value);
    status = "valid";
  } catch (error) {
    status =
      error && typeof error === "object" && "code" in error && error.code === "ENOENT"
        ? "missing"
        : "error";
  }
  const store = {
    read: () => parsePreferences(current),
    snapshot: (): PreferenceSnapshot => ({ status, preferences: parsePreferences(current) }),
    save(value: DevicePreferences) {
      if (!isDevicePreferences(value)) return false;
      const parsed: DevicePreferences = { ...current, ...parsePreferences(value) };
      const nextFields = { ...fields, ...parsed };
      const temporary = `${file}.${crypto.randomUUID()}.tmp`;
      try {
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(temporary, JSON.stringify(nextFields), { mode: 0o600, flag: "wx" });
        renameSync(temporary, file);
        current = parsed;
        fields = nextFields;
        status = "valid";
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
    saveAnalytics(analytics: AnalyticsConsent) {
      return isAnalyticsConsent(analytics) && store.save({ ...current, analytics });
    },
    preload() {
      const snapshot: PreferenceSnapshot = { status, preferences: parsePreferences(current) };
      return `(()=>{const snapshot=${JSON.stringify(snapshot)};if(snapshot.preferences.analytics)Object.freeze(snapshot.preferences.analytics);Object.freeze(snapshot.preferences);Object.freeze(snapshot);Object.defineProperty(window,${JSON.stringify(DEVICE_PREFERENCES_KEY)},{value:snapshot});})();`;
    },
  };
  return store;
}
