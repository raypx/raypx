import { IntlError, IntlErrorCode } from "use-intl/core";
import { expect, it, vi } from "vite-plus/test";
import { intlErrorHandlers } from "./diagnostics.js";
import { createTranslator } from "./translator.js";

it("reports known message keys once per locale without logging interpolation values", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const messages = { probe: { greeting: "Hello {name} {lastName}" } } as const;
    for (const locale of ["en", "zh"] as const) {
      const t = createTranslator({ locale, messages, namespace: "probe" });
      const values = { name: "private-value" };
      expect(Reflect.apply(t, undefined, ["greeting", values])).toBe("probe.greeting");
      Reflect.apply(t, undefined, ["greeting", values]);
    }
    expect(warn.mock.calls).toEqual([
      ["[raypx:i18n]", { locale: "en", code: "FORMATTING_ERROR", key: "probe.greeting" }],
      ["[raypx:i18n]", { locale: "zh", code: "FORMATTING_ERROR", key: "probe.greeting" }],
    ]);
  } finally {
    warn.mockRestore();
  }
});

it("reports reference catalog keys and omits unknown lookup strings and exception text", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const { onError, getMessageFallback } = intlErrorHandlers("zh", {}, [
      { probe: {} },
      { probe: { recognized: "English reference" } },
    ]);
    for (const key of ["recognized", "unrecognized-private-string"]) {
      const error = new IntlError(IntlErrorCode.MISSING_MESSAGE, "private diagnostic");
      onError(error);
      expect(getMessageFallback({ namespace: "probe", key, error })).toBe(`probe.${key}`);
    }
    onError(new IntlError(IntlErrorCode.MISSING_FORMAT, "private format name"));
    await Promise.resolve();
    expect(warn.mock.calls).toEqual([
      ["[raypx:i18n]", { locale: "zh", code: "MISSING_MESSAGE", key: "probe.recognized" }],
      ["[raypx:i18n]", { locale: "zh", code: "MISSING_MESSAGE" }],
      ["[raypx:i18n]", { locale: "zh", code: "MISSING_FORMAT" }],
    ]);
  } finally {
    warn.mockRestore();
  }
});
