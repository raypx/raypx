import { describe, expect, it } from "vite-plus/test";

import { parseAcceptLanguage } from "./accept-language.js";
import { createLocaleRuntime } from "./locale.js";

const runtime = createLocaleRuntime({
  locales: ["en", "zh", "pt-BR", "de-DE"] as const,
  defaultLocale: "en",
  cookieName: "demo_locale",
  cookieMaxAgeSeconds: 3600,
});

describe("configurable locale runtime", () => {
  it("normalizes configured region and language tags with lookup", () => {
    expect(runtime.normalizeLocale("en-US")).toBe("en");
    expect(runtime.normalizeLocale("zh-Hans-CN")).toBe("zh");
    expect(runtime.normalizeLocale("PT_br")).toBe("pt-BR");
    expect(runtime.normalizeLocale("de-DE-u-ca-gregory")).toBe("de-DE");
    expect(runtime.normalizeLocale("de")).toBeUndefined();
    expect(runtime.normalizeLocale("fr-FR")).toBeUndefined();
    expect(runtime.normalizeLocale("en; path=/")).toBeUndefined();
    expect(runtime.isLocale("pt-BR")).toBe(true);
    expect(runtime.isLocale("pt-br")).toBe(false);
  });

  it("keeps configuration immutable and isolates independent runtimes", () => {
    const locales = ["fr", "es"];
    const configuration = { locales, defaultLocale: "fr" };
    const other = createLocaleRuntime(configuration);
    locales.push("en");
    configuration.defaultLocale = "es";
    expect(other.locales).toEqual(["fr", "es"]);
    expect(other.defaultLocale).toBe("fr");
    expect(Object.isFrozen(other.locales)).toBe(true);
    expect(Object.isFrozen(other)).toBe(true);
    expect(other.normalizeLocale("en")).toBeUndefined();
    expect(runtime.normalizeLocale("fr")).toBeUndefined();
    expect(other.resolveLocale()).toBe("fr");
  });

  it("resolves cookies before language quality and then configured fallback", () => {
    expect(runtime.resolveLocale({ cookieLocale: "zh-CN", acceptLanguage: "en" })).toBe("zh");
    expect(runtime.resolveLocale({ acceptLanguage: "fr, de-DE;q=0.9, en;q=0.2" })).toBe("de-DE");
    expect(runtime.resolveLocale({ acceptLanguage: "fr", fallbackLocale: "pt-BR" })).toBe("pt-BR");
    expect(runtime.resolveLocale()).toBe("en");
    expect(runtime.resolveLocale({ acceptLanguage: "zh;q=0, en;q=0.4" })).toBe("en");
  });

  it("round trips only its configured cookie and skips malformed duplicates", () => {
    const cookie = runtime.serializeLocaleCookie("zh", { secure: true });
    expect(cookie).toBe("demo_locale=zh; Path=/; Max-Age=3600; SameSite=Lax; Secure");
    expect(runtime.getLocaleCookie(cookie)).toBe("zh");
    expect(runtime.getLocaleCookie("locale=zh")).toBeUndefined();
    expect(runtime.getLocaleCookie("demo_locale=%E0%A4; demo_locale=pt-BR")).toBe("pt-BR");
    expect(runtime.getLocaleCookie("demo_locale=fr; demo_locale=zh-CN")).toBe("zh");
  });

  it.each([
    { locales: [], defaultLocale: "en" },
    { locales: ["system"], defaultLocale: "system" },
    { locales: ["en"], defaultLocale: "zh" },
    { locales: ["en", "EN"], defaultLocale: "en" },
    { locales: ["invalid locale"], defaultLocale: "invalid locale" },
    { locales: ["en"], defaultLocale: "en", cookieName: "locale; Secure" },
    { locales: ["en"], defaultLocale: "en", cookieMaxAgeSeconds: -1 },
    { locales: ["en"], defaultLocale: "en", cookieMaxAgeSeconds: 1.5 },
  ])("rejects invalid locale or persistence configuration %#", (configuration) => {
    expect(() => createLocaleRuntime(configuration)).toThrow(TypeError);
  });

  it("guards runtime values that bypass the supported locale union", () => {
    // @ts-expect-error Only configured locales are accepted.
    expect(() => runtime.serializeLocaleCookie("fr")).toThrow(TypeError);
    const looseRuntime = runtime as ReturnType<typeof createLocaleRuntime<string>>;
    expect(() => looseRuntime.serializeLocaleCookie("fr")).toThrow(TypeError);
    expect(() => looseRuntime.resolveLocale({ fallbackLocale: "fr" })).toThrow(TypeError);
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
});

describe("ordered locale candidates and device preferences", () => {
  it("matches the first supported candidate after canonicalization", () => {
    expect(runtime.matchLocale(["fr-FR", "pt_br", "zh-CN"])).toBe("pt-BR");
    expect(runtime.matchLocale(["bad locale", "de-DE-u-ca-gregory", "en"])).toBe("de-DE");
    expect(runtime.matchLocale([])).toBeUndefined();
    expect(runtime.matchLocale(["fr", "es"])).toBeUndefined();
  });
  it("parses only exact preferences and reserves system for automatic selection", () => {
    expect(runtime.parsePreference("zh")).toBe("zh");
    expect(runtime.parsePreference("pt-BR")).toBe("pt-BR");
    for (const value of ["system", "zh-CN", "PT_br", "ZH", "fr", "", null, undefined, 42, {}]) {
      expect(runtime.parsePreference(value)).toBe("system");
    }
  });
  it("uses explicit preferences before all system candidates and then default", () => {
    expect(runtime.resolvePreference("zh", ["en", "pt-BR"])).toBe("zh");
    expect(runtime.resolvePreference("system", ["fr-FR", "de-DE", "zh"])).toBe("de-DE");
    expect(runtime.resolvePreference("system", ["fr"])).toBe("en");
    // @ts-expect-error unsupported explicit preference
    expect(() => runtime.resolvePreference("fr", ["zh"])).toThrow(TypeError);
  });
});
