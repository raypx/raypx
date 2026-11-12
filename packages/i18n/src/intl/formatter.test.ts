import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { createFormatter } from "./formatter.js";
import type { DateTimeFormatOptions } from "./types.js";

describe("upstream formatter with normalized defaults", () => {
  it("uses an object configuration, preserves presets and replaces individual definitions", () => {
    const formatter = createFormatter({
      locale: "en",
      formats: {
        number: { money: { style: "currency", currency: "EUR" } },
        list: { choice: { type: "disjunction" } },
      },
    });
    expect(formatter.number(2, "money")).toBe("€2.00");
    expect(formatter.number(1200, "compact")).toMatch(/1.2K/i);
    expect(formatter.list(["A", "B"], "choice")).toBe("A or B");
    expect(
      createFormatter({
        locale: "en",
        formats: { number: { compact: { maximumFractionDigits: 0 } } },
      }).number(1234.5, "compact"),
    ).toBe("1,235");
  });

  it("uses UTC by default with provider and per-call timezone overrides", () => {
    const date = new Date("2026-08-24T00:30:00Z");
    const utc = createFormatter({ locale: "en" });
    const losAngeles = createFormatter({ locale: "en", timeZone: "America/Los_Angeles" });
    expect(utc.dateTime(date, { day: "numeric" })).toBe("24");
    expect(losAngeles.dateTime(date, { day: "numeric" })).toBe("23");
    expect(losAngeles.dateTime(date, { day: "numeric", timeZone: "UTC" })).toBe("24");
  });

  it("retains native ranges, display names, overrides and rich lists", () => {
    const formatter = createFormatter({
      locale: "en",
      formats: {
        displayName: { languages: { type: "language" } },
        number: { money: { style: "currency", currency: "USD" } },
      },
    });
    const start = new Date("2026-08-24T00:30:00Z");
    const end = new Date("2026-08-26T00:30:00Z");
    const options: DateTimeFormatOptions = { month: "short", day: "numeric" };
    expect(formatter.dateTimeRange(start, end, options)).toBe(
      new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).formatRange(start, end),
    );
    expect(formatter.displayName("de", "languages")).toBe("German");
    expect(formatter.number(2, "money", { currency: "EUR" })).toBe("€2.00");
    const list = formatter.list([
      createElement("b", { key: "a" }, "A"),
      createElement("b", { key: "b" }, "B"),
    ]);
    expect(renderToStaticMarkup(createElement("span", null, list))).toBe(
      "<span><b>A</b> and <b>B</b></span>",
    );
  });

  it("uses upstream date-based relative time and error handling", () => {
    const now = new Date("2026-08-25T00:00:00Z");
    const yesterday = new Date("2026-08-24T00:00:00Z");
    const onError = vi.fn();
    const formatter = createFormatter({ locale: "en", now, onError });
    expect(formatter.relativeTime(yesterday)).toBe("1 day ago");
    expect(formatter.relativeTime(yesterday, { now, unit: "day" })).toBe("1 day ago");
    expect(formatter.relativeTime(yesterday, now)).toBe("1 day ago");
    expect(formatter.dateTime(new Date(NaN))).toBe("Invalid Date");
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "FORMATTING_ERROR" }));
    expect(() => formatter.number(1, "missing")).not.toThrow();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "MISSING_FORMAT" }));
  });
});
