import { browserPreferenceStore } from "@raypx/analytics/browser";
import {
  isAnalyticsConsent,
  parseAnalyticsConsent,
  type AnalyticsPreferenceStore,
} from "@raypx/analytics";
import { getBridge, isDesktop } from "../../lib/desktop";
export function desktopAnalyticsStore(): AnalyticsPreferenceStore {
  const browser = browserPreferenceStore();
  return {
    async read() {
      if (!isDesktop()) return browser.read();
      try {
        const value: unknown = await (
          await getBridge()
        ).request.getAnalyticsPreferences({}, { maxRequestTime: 5000 });
        return parseAnalyticsConsent(isAnalyticsConsent(value) ? value : null);
      } catch {
        return parseAnalyticsConsent(null);
      }
    },
    async write(value) {
      if (!isDesktop()) return browser.write(value);
      return (await getBridge()).request.saveAnalyticsPreferences(value);
    },
  };
}
