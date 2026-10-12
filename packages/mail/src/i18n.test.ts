import { describe, expect, it } from "vite-plus/test";

import { assertMessageCatalogParity } from "@voidmix/i18n/testing";
import en from "../messages/en.json" with { type: "json" };
import zh from "../messages/zh.json" with { type: "json" };

describe("mail i18n catalogs", () => {
  it("keeps recursive message keys, node types, and ICU arguments aligned", () => {
    expect(() => assertMessageCatalogParity(en, zh, "en", "zh")).not.toThrow();
  });
});
