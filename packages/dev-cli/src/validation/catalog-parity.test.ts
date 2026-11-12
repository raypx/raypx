import { describe, expect, it } from "vitest";

import {
  assertMessageCatalogParity,
  compareMessageCatalogs,
  extractIcuArguments,
  extractIcuSignature,
} from "./catalog-parity.js";

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

  it("returns catalog issues instead of throwing", () => {
    expect(compareMessageCatalogs({ greeting: "Hi {name}" }, { greeting: "Hallo {name}" })).toEqual(
      [],
    );
    expect(
      compareMessageCatalogs({ greeting: "Hi {name}" }, { greeting: "Hallo {other}" }),
    ).not.toEqual([]);
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

it("tracks rich-text callback names separately from ordinary values", () => {
  expect(
    extractIcuSignature("<strong>{name}</strong> {count, plural, other {<em># {name}</em>}}"),
  ).toEqual({ arguments: ["count", "name"], tags: ["em", "strong"] });
  expect(extractIcuArguments("<strong>{name}</strong>")).toEqual(["name"]);
  expect(
    compareMessageCatalogs({ value: "<strong>{name}</strong>" }, { value: "<em>{name}</em>" }),
  ).toEqual([
    expect.objectContaining({
      kind: "parity",
      path: "value",
      message: expect.stringContaining("tags"),
    }),
  ]);
  expect(compareMessageCatalogs({ value: "{name}" }, { value: "<name>Text</name>" })).toHaveLength(
    2,
  );
});

it("allows reordered values, different plural categories and tag nesting", () => {
  const left = {
    value: "<strong>{name} <em>{count, plural, one {# item} other {# items}}</em></strong>",
  };
  const right = {
    value: "<em>{count, plural, few {#} many {#} other {#}}</em> <strong>{name}</strong>",
  };
  expect(compareMessageCatalogs(left, right)).toEqual([]);
});

it.each(["left", "right", "both"] as const)(
  "identifies only invalid ICU sides: %s",
  (invalidSide) => {
    const left = { nested: { value: invalidSide === "right" ? "Hi {name}" : "Hi {" } };
    const right = { nested: { value: invalidSide === "left" ? "Hallo {name}" : "Hallo {" } };
    const issues = compareMessageCatalogs(left, right, "en", "de");
    expect(issues.map(({ side, locale, path }) => ({ side, locale, path }))).toEqual(
      invalidSide === "both"
        ? [
            { side: "left", locale: "en", path: "nested.value" },
            { side: "right", locale: "de", path: "nested.value" },
          ]
        : [
            {
              side: invalidSide,
              locale: invalidSide === "left" ? "en" : "de",
              path: "nested.value",
            },
          ],
    );
    for (const issue of issues) {
      expect(issue.kind).toBe("parse");
      expect(issue.fix).toContain(issue.locale);
    }
  },
);

it("reports malformed catalog nodes rather than throwing", () => {
  const invalid = { nested: null } as unknown as import("../repo/catalogs.js").CatalogTree;
  expect(compareMessageCatalogs(invalid, { nested: { value: "x" } }, "en", "de")).toEqual([
    expect.objectContaining({ kind: "parity", side: "left", locale: "en", path: "nested" }),
  ]);
});
