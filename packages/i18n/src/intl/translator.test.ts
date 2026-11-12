import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { createTranslator } from "./translator.js";
import type { DynamicMessages } from "./types.js";

const messages = {
  home: {
    greeting: "Hi {name}",
    count: "{count, plural, one {# item} other {# items}}",
  },
} as const;

describe("typed upstream translator", () => {
  it("translates namespaced messages, plurals and apostrophe quoting", () => {
    const translate = createTranslator({ locale: "en", messages, namespace: "home" });
    expect(translate("greeting", { name: "Ada" })).toBe("Hi Ada");
    expect(translate("count", { count: 3 })).toBe("3 items");
    const quoted = createTranslator({
      locale: "en",
      messages: { value: "'{name}' {name}. It's today" },
    });
    expect(quoted("value", { name: "Ada" })).toBe("{name} Ada. It's today");
  });

  it("keeps dynamic catalogs broad while preserving upstream runtime behavior", () => {
    const catalog: DynamicMessages = {
      status: "{status, select, active {Active} other {Unknown}}",
      place: "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}",
      guests:
        "{count, plural, offset:1 =0 {Nobody} one {You and # guest} other {You and # guests}}",
    };
    const translate = createTranslator({ locale: "en", messages: catalog });
    expect(translate("status", { status: "active" })).toBe("Active");
    expect(translate("status", { status: "disabled" })).toBe("Unknown");
    expect(translate("place", { place: 21 })).toBe("21st");
    expect(translate("guests", { count: 5 })).toBe("You and 4 guests");
  });

  it("uses qualified fallback for dynamic missing messages and missing values", () => {
    const catalog: DynamicMessages = {
      home: { greeting: "Hi {name}", invalid: "Unclosed {", nested: { value: "x" } },
    };
    const translate = createTranslator({ locale: "en", messages: catalog, namespace: "home" });
    expect(translate("missing")).toBe("home.missing");
    expect(translate("greeting")).toBe("home.greeting");
    expect(translate("invalid")).toBe("home.invalid");
    expect(translate("nested")).toBe("home.nested");
    expect(translate("constructor")).toBe("home.constructor");
    expect(
      createTranslator({ locale: "en", messages: catalog, namespace: "missing" })("greeting"),
    ).toBe("missing.greeting");
  });

  it("uses UTC and normalizes named presets for ICU dates and numbers", () => {
    const translate = createTranslator({
      locale: "en",
      messages: {
        day: "{date, date, short}",
        cost: "{cost, number, money}",
        clock: "{date, time, clock}",
      },
      formats: {
        number: { money: { style: "currency", currency: "EUR" } },
        dateTime: {
          short: { dateStyle: "short" },
          clock: { hour: "2-digit", hourCycle: "h23", timeZone: "UTC" },
        },
      },
    });
    const date = new Date("2026-08-24T00:30:00Z");
    expect(translate("day", { date })).toBe("8/24/26");
    expect(translate("clock", { date })).toBe("00");
    expect(translate("cost", { cost: 2 })).toBe("€2.00");
    expect(
      translate("cost", { cost: 2 }, { number: { money: { style: "currency", currency: "USD" } } }),
    ).toBe("$2.00");
    expect(translate("cost", { cost: 2 })).toBe("€2.00");
  });

  it("exposes rich, markup, raw and presence behavior directly from upstream", () => {
    const translate = createTranslator({
      locale: "en",
      messages: { title: "Hello <strong>{name}</strong>", plain: "Text" },
    });
    const rich = translate.rich("title", {
      name: "Ada",
      strong: (chunks) => createElement("strong", null, chunks),
    });
    expect(renderToStaticMarkup(createElement("span", null, rich))).toBe(
      "<span>Hello <strong>Ada</strong></span>",
    );
    expect(translate.markup("title", { name: "Ada", strong: (chunks) => `<b>${chunks}</b>` })).toBe(
      "Hello <b>Ada</b>",
    );
    expect(translate.raw("plain")).toBe("Text");
    expect(translate.has("plain")).toBe(true);
  });

  it("keeps quiet fallback and delegates explicit error policies", () => {
    const catalog: DynamicMessages = messages;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(
        createTranslator({ locale: "en", messages: catalog, namespace: "home" })("missing"),
      ).toBe("home.missing");
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
    const onError = vi.fn();
    const translate = createTranslator({
      locale: "en",
      messages: catalog,
      namespace: "home",
      onError,
      getMessageFallback: ({ namespace, key, error }) => `${namespace}.${key}:${error.code}`,
    });
    expect(translate("missing")).toBe("home.missing:MISSING_MESSAGE");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "MISSING_MESSAGE" }));
    const failure = new Error("Application policy");
    expect(() =>
      createTranslator({
        locale: "en",
        messages: catalog,
        onError: () => {
          throw failure;
        },
      })("missing"),
    ).toThrow(failure);
  });
});
