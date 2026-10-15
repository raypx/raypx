import { describe, expect, it } from "vite-plus/test";
import { parseLocalePreference, resolveLocalePreference } from "./preferences";
import en from "./messages/en";
import zh from "./messages/zh";

describe("device locale preferences", () => {
  it("resolves system languages and validates stored preferences", () => {
    expect(parseLocalePreference("zh")).toBe("zh");
    expect(parseLocalePreference("invalid")).toBe("system");
    expect(parseLocalePreference(null)).toBe("system");
    expect(resolveLocalePreference("system", "zh-SG")).toBe("zh");
    expect(resolveLocalePreference("system", "fr-FR")).toBe("en");
    expect(resolveLocalePreference("en", "zh-CN")).toBe("en");
  });
  it("keeps every foundation namespace and message present in both locales", () => {
    expect(Object.keys(en)).toEqual(Object.keys(zh));
    for (const namespace of Object.keys(en) as (keyof typeof en)[]) {
      expect(Object.keys(en[namespace])).toEqual(Object.keys(zh[namespace]));
      expect(Object.values(en[namespace]).every(Boolean)).toBe(true);
      expect(Object.values(zh[namespace]).every(Boolean)).toBe(true);
    }
  });
});
