import { describe, expect, it } from "vitest";
import { parseLocalePreference, resolveLocalePreference } from "./preferences.js";
import en from "../locales/en/index.js";
import zh from "../locales/zh/index.js";

describe("device locale preferences", () => {
  it("resolves system languages and validates stored preferences", () => {
    expect(parseLocalePreference("zh")).toBe("zh");
    expect(parseLocalePreference("en")).toBe("en");
    for (const value of ["system", "zh-CN", "ZH_cn", "ZH", "fr", "", null, undefined, 42, {}]) {
      expect(parseLocalePreference(value)).toBe("system");
    }
    expect(resolveLocalePreference("system", ["fr-FR", "zh-SG"])).toBe("zh");
    expect(resolveLocalePreference("system", ["fr-FR"])).toBe("en");
    expect(resolveLocalePreference("en", ["zh-CN"])).toBe("en");
    expect(resolveLocalePreference("system", ["fr-FR", "zh-CN", "en"])).toBe("zh");
    expect(resolveLocalePreference("system")).toBe("en");
    // @ts-expect-error unsupported explicit preference
    expect(() => resolveLocalePreference("fr", ["zh"])).toThrow(TypeError);
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
