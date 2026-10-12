import { describe, expect, it } from "vite-plus/test";

import { assertMessageCatalogParity } from "@voidmix/i18n/testing";
import { loadWebMessages } from "./messages";
import { messages } from "../tests/fixtures/messages";

describe("web i18n catalogs", () => {
  it.each([
    ["common", "language"],
    ["home", "askVoidmix"],
    ["auth", "signIn"],
    ["errors", "unknown"],
  ] as const)("loads the %s namespace from each catalog", (namespace, key) => {
    expect(messages.en[namespace]).toBeDefined();
    expect(messages.zh[namespace]).toBeDefined();
    expect(key in (messages.en[namespace] as Record<string, unknown>)).toBe(true);
    expect(key in (messages.zh[namespace] as Record<string, unknown>)).toBe(true);
  });

  it("keeps identical root namespace keys for both locales", () => {
    expect(Object.keys(messages.en).sort()).toEqual(Object.keys(messages.zh).sort());
  });

  it("keeps recursive message keys, node types, and ICU arguments aligned", () => {
    expect(() => assertMessageCatalogParity(messages.en, messages.zh, "en", "zh")).not.toThrow();
  });

  it("loads each Web catalog through its locale-specific async branch", async () => {
    await expect(loadWebMessages("en")).resolves.toEqual(messages.en);
    await expect(loadWebMessages("zh")).resolves.toEqual(messages.zh);
  });
});
