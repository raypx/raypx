import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";

import { RECOVERY_MESSAGES, RECOVERY_MESSAGE_KEYS } from "./recovery-messages";

/**
 * The error and not-found pages carry their own copy of a handful of `common`
 * messages because they must not suspend. That duplication is deliberate, but it
 * can drift — an inline fallback drifting from the catalog is exactly what broke
 * `e2e/tests/web.spec.ts`. These assertions read the catalogs off disk so the
 * drift fails a test instead of shipping.
 */
async function readCatalog(locale: "en" | "zh"): Promise<Record<string, string>> {
  const url = new URL(`../messages/${locale}.json`, import.meta.url);
  const parsed = JSON.parse(await readFile(url, "utf8")) as {
    common?: Record<string, string>;
  };
  return parsed.common ?? {};
}

describe("recovery messages", () => {
  it.each(["en", "zh"] as const)("matches the %s catalog exactly", async (locale) => {
    const catalog = await readCatalog(locale);

    for (const key of RECOVERY_MESSAGE_KEYS) {
      expect(catalog[key], `common.${key} missing from ${locale}.json`).toBeDefined();
      expect(RECOVERY_MESSAGES[locale][key], `common.${key} drifted in ${locale}`).toBe(
        catalog[key],
      );
    }
  });

  it("covers both supported locales with identical key sets", () => {
    expect(Object.keys(RECOVERY_MESSAGES.zh).sort()).toEqual(
      Object.keys(RECOVERY_MESSAGES.en).sort(),
    );
  });
});
