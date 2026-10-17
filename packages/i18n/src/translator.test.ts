import { describe, expect, it } from "vite-plus/test";

import { createTranslator } from "./translator.js";
import type { DynamicMessages } from "./index.js";

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
  it("supports an explicitly typed runtime catalog through the product entry", () => {
    const dynamic: DynamicMessages = messages;
    const translate = createTranslator({ locale: "en", messages: dynamic, namespace: "home" });
    const key: string = "greeting";
    expect(translate(key, { name: "Ada" })).toBe("Hi Ada");
  });
});
