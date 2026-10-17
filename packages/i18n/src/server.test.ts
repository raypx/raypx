import { describe, expect, it } from "vite-plus/test";

import { resolveRequestLocale, resolveRequestLocaleHint } from "./server.js";

describe("server locale resolution", () => {
  it("returns only an explicit request hint when requested", () => {
    expect(
      resolveRequestLocaleHint(new Headers({ "accept-language": "fr-FR, de;q=0.8" })),
    ).toBeUndefined();
    expect(resolveRequestLocaleHint(new Headers())).toBeUndefined();
    expect(
      resolveRequestLocaleHint(new Headers({ cookie: "locale=en", "accept-language": "zh-CN" })),
    ).toBe("en");
  });

  it("keeps the required resolver fallback for requests without a hint", () => {
    expect(resolveRequestLocale(new Headers())).toBe("en");
    expect(resolveRequestLocale(new Headers(), "zh")).toBe("zh");
  });
});
