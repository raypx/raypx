import { describe, expect, it } from "vite-plus/test";

import {
  createFormatter,
  formats,
  DEFAULT_LOCALE,
  getLocaleCookie,
  isLocale,
  matchLocale,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  serializeLocaleCookie,
  LOCALE_OPTIONS,
  SUPPORTED_LOCALES,
} from "./index.js";

describe("locale runtime", () => {
  it("exposes native names for every supported locale", () => {
    expect(LOCALE_OPTIONS).toEqual([
      { value: "en", nativeName: "English" },
      { value: "zh", nativeName: "简体中文" },
    ]);
  });

  it("keeps the product locale list fixed", () => {
    expect(SUPPORTED_LOCALES).toEqual(["en", "zh"]);
    expect(Object.isFrozen(SUPPORTED_LOCALES)).toBe(true);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("normalizes region, script, underscores and extension tags", () => {
    expect(normalizeLocale("en-US")).toBe("en");
    expect(normalizeLocale("zh-Hans-CN")).toBe("zh");
    expect(normalizeLocale("ZH_cn")).toBe("zh");
    expect(normalizeLocale("en-US-u-ca-gregory")).toBe("en");
    expect(normalizeLocale("fr-FR")).toBeUndefined();
    expect(normalizeLocale("en; path=/")).toBeUndefined();
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("ZH")).toBe(false);
  });

  it("matches the first supported candidate after canonicalization", () => {
    expect(matchLocale(["fr-FR", "zh_cn", "en-US"])).toBe("zh");
    expect(matchLocale(["bad locale", "en-US-u-ca-gregory", "zh"])).toBe("en");
    expect(matchLocale([])).toBeUndefined();
    expect(matchLocale(["fr", "es"])).toBeUndefined();
  });

  it("resolves cookie, browser preference and fallback in order", () => {
    expect(resolveLocale({ cookieLocale: "zh-CN", acceptLanguage: "en-US" })).toBe("zh");
    expect(resolveLocale({ acceptLanguage: "zh-CN, en;q=0.8" })).toBe("zh");
    expect(resolveLocale({ acceptLanguage: "fr-FR" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "fr, zh-CN;q=0.9, en;q=0.2" })).toBe("zh");
    expect(resolveLocale({ acceptLanguage: "fr", fallbackLocale: "zh" })).toBe("zh");
    expect(resolveLocale()).toBe("en");
    expect(resolveLocale({ acceptLanguage: "zh;q=0, en;q=0.4" })).toBe("en");
  });

  it("round trips the locale cookie and skips malformed duplicates", () => {
    const cookie = serializeLocaleCookie("zh", { secure: true });
    expect(cookie).toBe("locale=zh; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
    expect(getLocaleCookie(cookie)).toBe("zh");
    expect(getLocaleCookie("raypx_locale=zh")).toBeUndefined();
    expect(getLocaleCookie("raypx_locale=zh; locale=en")).toBe("en");
    expect(getLocaleCookie("locale=%E0%A4; locale=zh")).toBe("zh");
    expect(getLocaleCookie("locale=fr; locale=zh-CN")).toBe("zh");
  });

  it("rejects unsupported cookie and fallback locales from untyped callers", () => {
    // @ts-expect-error Only configured locales are accepted.
    expect(() => serializeLocaleCookie("fr")).toThrow(TypeError);
    // @ts-expect-error A fallback must belong to the product locale union.
    expect(() => resolveLocale({ fallbackLocale: "fr" })).toThrow(TypeError);
  });

  it("honors language quality, ignores malformed weights and preserves ties", () => {
    expect(parseAcceptLanguage("en;q=0.4, zh-CN;q=0.9, fr;q=0, de;q=2, pt;q=oops")).toEqual([
      { locale: "zh-CN", quality: 0.9 },
      { locale: "en", quality: 0.4 },
    ]);
    expect(parseAcceptLanguage("zh;q=0.8, en;q=0.8")).toEqual([
      { locale: "zh", quality: 0.8 },
      { locale: "en", quality: 0.8 },
    ]);
  });

  it("formats numbers and dates with the active locale", () => {
    const english = createFormatter({ locale: "en" });
    const chinese = createFormatter({ locale: "zh" });
    const date = new Date("2026-08-24T00:00:00.000Z");

    const currency = { style: "currency", currency: "CNY" } as const;
    expect(english.number(1234.5, currency)).not.toBe(chinese.number(1234.5, currency));
    expect(english.dateTime(date, { timeZone: "UTC", year: "numeric" })).toContain("2026");
    expect(chinese.dateTime(date, { timeZone: "UTC", year: "numeric" })).toContain("2026");
  });

  it("preserves timezone-specific results and named presets", () => {
    const date = new Date("2026-08-24T00:30:00.000Z");
    const utc = createFormatter({ locale: "en", timeZone: "UTC" });
    const losAngeles = createFormatter({ locale: "en", timeZone: "America/Los_Angeles" });

    expect(utc.dateTime(date, { day: "numeric" })).toBe("24");
    expect(losAngeles.dateTime(date, { day: "numeric" })).toBe("23");
    expect(utc.number(1_200, "compact")).toMatch(/1.2K/i);
    expect(utc.dateTime(date, "timestamp")).toBe(
      new Intl.DateTimeFormat("en", { ...formats.dateTime.timestamp, timeZone: "UTC" }).format(
        date,
      ),
    );
    expect(utc.relativeTime(new Date("2026-08-23T00:30:00Z"), date)).toBe("1 day ago");
  });
});
