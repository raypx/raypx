import { describe, expect, it } from "vite-plus/test";

import { assertMessageCatalogParity, extractIcuArguments } from "./testing.js";

describe("message catalog testing helpers", () => {
  it.each([
    [
      "plural arguments",
      "{count, plural, one {{name} has # item} other {{name} has # items}}",
      ["count", "name"],
    ],
    [
      "branch labels",
      "{status, select, active {Active} suspended {Suspended} other {Unknown}} {count, plural, one {# file} other {# files}}",
      ["count", "status"],
    ],
    ["ordinary apostrophes", "Today's {date}", ["date"]],
  ] as const)("extracts %s", (_name, message, expected) => {
    expect(extractIcuArguments(message)).toEqual(expected);
  });

  it("reports missing keys, type changes, and ICU argument drift with paths", () => {
    expect(() =>
      assertMessageCatalogParity(
        { home: { greeting: "Hi {name}", nested: { value: "x" } } },
        { home: { greeting: "你好", nested: "x" } },
        "en",
        "zh",
      ),
    ).toThrow(/home.greeting|home.nested/);
  });

  it.each([
    [
      "equivalent structure and arguments",
      { home: { greeting: "Hi {name}", count: "{count, plural, one {# item} other {# items}}" } },
      { home: { greeting: "你好，{name}", count: "{count, plural, one {# 项} other {# 项}}" } },
    ],
    [
      "translated select branches",
      { status: "{status, select, active {Active} other {Unknown}}" },
      { status: "{status, select, active {启用} other {未知}}" },
    ],
  ])("accepts %s", (_name, en, zh) => {
    expect(() => assertMessageCatalogParity(en, zh, "en", "zh")).not.toThrow();
  });
});
