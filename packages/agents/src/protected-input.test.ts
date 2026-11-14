import { expect, it } from "vitest";
import { scrubProtectedOutput } from "./protected-input.js";

it.each(["opaque-value", '中文\n"\\value', "a\tb\rc"])(
  "scrubs exact and nested JSON echoes without exposing the input",
  (value) => {
    let output = value;
    for (let depth = 0; depth < 5; depth++) {
      const cleaned = scrubProtectedOutput(output, value);
      expect(cleaned.includes(value)).toBe(false);
      expect(cleaned).toContain("[protected]");
      output = JSON.stringify({ content: output });
    }
  },
);
