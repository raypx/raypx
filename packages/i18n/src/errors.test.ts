import { describe, expect, it } from "vite-plus/test";

import {
  readErrorCode,
  readErrorDetails,
  translateErrorCode,
  translateKnownErrorCode,
} from "./errors.js";

const messages = {
  missing: "Missing",
  unknown: "Unknown",
} as const;
const translate = (key: string) => messages[key as keyof typeof messages] ?? key;
const errorKeys = { NOT_FOUND: "missing" } as const;

describe("error-code translation helpers", () => {
  it("reads string error codes without trusting other shapes", () => {
    expect(readErrorCode({ code: "NOT_FOUND" })).toBe("NOT_FOUND");
    expect(readErrorCode({ code: 404 })).toBeUndefined();
    expect(readErrorCode(null)).toBeUndefined();
    expect(readErrorCode({ toString: "NOT_FOUND" })).toBeUndefined();
    expect(readErrorCode(Object.create({ code: "NOT_FOUND" }))).toBeUndefined();
  });

  it("translates known codes and falls back for unknown errors", () => {
    expect(translateErrorCode({ code: "NOT_FOUND" }, translate, errorKeys)).toBe("Missing");
    expect(translateErrorCode({ code: "OTHER" }, translate, errorKeys)).toBe("Unknown");
    expect(translateKnownErrorCode({ code: "NOT_FOUND" }, translate, errorKeys)).toBe("Missing");
    expect(translateKnownErrorCode({ code: "OTHER" }, translate, errorKeys)).toBeNull();
  });

  it("reads structured wire error details and ignores unsafe values", () => {
    expect(
      readErrorDetails({
        data: { error: { code: "LIMIT", values: { count: 2, label: "items", unsafe: {} } } },
      }),
    ).toEqual({ code: "LIMIT", values: { count: 2, label: "items" } });
    expect(
      translateErrorCode({ data: { error: { code: "NOT_FOUND" } } }, translate, errorKeys),
    ).toBe("Missing");
  });

  it("accepts boolean and null ICU values while ignoring inherited error fields", () => {
    const inherited = Object.create({ error: { code: "NOT_FOUND" } }) as Record<string, unknown>;
    expect(readErrorDetails(inherited)).toBeUndefined();
    expect(
      readErrorDetails({
        data: { error: { code: "LIMIT", values: { enabled: false, missing: null } } },
      }),
    ).toEqual({ code: "LIMIT", values: { enabled: false, missing: null } });
  });

  it("drops non-finite and prototype-polluting values", () => {
    const details = readErrorDetails({
      data: {
        error: {
          code: "LIMIT",
          values: {
            finite: 2,
            nan: Number.NaN,
            infinite: Number.POSITIVE_INFINITY,
            ["__proto__"]: "unsafe",
          },
        },
      },
    });

    expect(details).toEqual({ code: "LIMIT", values: { finite: 2 } });
    expect(Object.prototype.hasOwnProperty.call(details?.values, "__proto__")).toBe(false);
  });

  it("ignores error-like objects whose accessors throw", () => {
    const error = {} as { data: unknown };
    Object.defineProperty(error, "data", {
      configurable: true,
      get() {
        throw new Error("unreadable");
      },
    });

    expect(readErrorCode(error)).toBeUndefined();
    expect(readErrorDetails(error)).toBeUndefined();
  });
});
