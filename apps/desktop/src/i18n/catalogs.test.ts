import { describe, expect, it } from "vite-plus/test";

import { assertMessageCatalogParity } from "@voidmix/i18n/testing";
import { messages } from "./messages";

describe("desktop i18n catalogs", () => {
  it("loads every supported locale synchronously", () => {
    expect(messages.en).toBeDefined();
    expect(messages.zh).toBeDefined();
  });

  it("keeps recursive message keys, node types, and ICU arguments aligned", () => {
    expect(() => assertMessageCatalogParity(messages.en, messages.zh, "en", "zh")).not.toThrow();
  });
});
