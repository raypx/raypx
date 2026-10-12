import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "./translator.js";

const messages = {
  home: {
    greeting: "Hi {name}",
    count: "{count, plural, one {# item} other {# items}}",
  },
} as const;

describe("use-intl translator facade", () => {
  it("creates a synchronous namespaced translator", () => {
    const translate = createTranslator({ locale: "en", messages, namespace: "home" });

    expect(translate("greeting", { name: "Ada" })).toBe("Hi Ada");
    expect(translate("count", { count: 3 })).toBe("3 items");
  });
});
