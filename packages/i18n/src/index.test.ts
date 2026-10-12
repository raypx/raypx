import { describe, expect, it } from "vite-plus/test";

import {
  createFormatter,
  getLocaleCookie,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  serializeLocaleCookie,
  LOCALE_OPTIONS,
} from "./index.js";

describe("locale runtime", () => {
  it("exposes native names for every supported locale", () => {
    expect(LOCALE_OPTIONS).toEqual([
      { value: "en", nativeName: "English" },
      { value: "zh", nativeName: "简体中文" },
    ]);
  });
  it("normalizes regional locale tags", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh");
    expect(normalizeLocale("fr-FR")).toBeUndefined();
  });

  it("resolves cookie, browser preference, and fallback", () => {
    expect(resolveLocale({ cookieLocale: "zh-CN", acceptLanguage: "en-US" })).toBe("zh");
    expect(resolveLocale({ acceptLanguage: "zh-CN, en;q=0.8" })).toBe("zh");
    expect(resolveLocale({ acceptLanguage: "fr-FR" })).toBe("en");
  });

  it("round trips the locale cookie", () => {
    const cookie = serializeLocaleCookie("zh", { secure: true });
    expect(cookie).toContain("locale=zh");
    expect(getLocaleCookie(cookie)).toBe("zh");
  });

  it("only reads the canonical locale cookie", () => {
    expect(getLocaleCookie("voidmix_locale=zh")).toBeUndefined();
    expect(getLocaleCookie("voidmix_locale=zh; locale=en")).toBe("en");
  });

  it("honors Accept-Language quality and stable ordering", () => {
    expect(parseAcceptLanguage("en;q=0.4, zh-CN;q=0.9, fr;q=0")).toEqual([
      { locale: "zh-CN", quality: 0.9 },
      { locale: "en", quality: 0.4 },
    ]);
  });

  it("formats numbers and dates with the active locale", () => {
    const english = createFormatter("en");
    const chinese = createFormatter("zh");
    const date = new Date("2026-08-24T00:00:00.000Z");

    const currency = { style: "currency", currency: "CNY" } as const;
    expect(english.number(1234.5, currency)).not.toBe(chinese.number(1234.5, currency));
    expect(english.dateTime(date, { timeZone: "UTC", year: "numeric" })).toContain("2026");
    expect(chinese.dateTime(date, { timeZone: "UTC", year: "numeric" })).toContain("2026");
  });

  it("caches formatters by locale and timezone and preserves named presets", () => {
    const date = new Date("2026-08-24T00:30:00.000Z");
    const utc = createFormatter("en", { timeZone: "UTC" });
    const losAngeles = createFormatter("en", { timeZone: "America/Los_Angeles" });

    expect(createFormatter("en", { timeZone: "UTC" })).toBe(utc);
    expect(utc).not.toBe(losAngeles);
    expect(utc.dateTime(date, { day: "numeric" })).toBe("24");
    expect(losAngeles.dateTime(date, { day: "numeric" })).toBe("23");
    expect(utc.number(1_200, "compact")).toMatch(/1.2K/i);
    expect(utc.relativeTime(-1, "day", "numeric")).toBe("yesterday");
  });
});
