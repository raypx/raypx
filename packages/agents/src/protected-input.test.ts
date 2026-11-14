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

it.each(["value /+中文?=&", "x", "\ud800", 'quote"\\value'])(
  "scrubs UTF-8 encodings before output is stored",
  (value) => {
    const bytes = Buffer.from(value);
    const variants = [
      bytes.toString("base64"),
      bytes.toString("base64url"),
      bytes.toString("hex"),
      bytes.toString("hex").toUpperCase(),
      encodeURIComponent(bytes.toString("utf8")),
      new URLSearchParams({ v: bytes.toString("utf8") }).toString().slice(2),
    ];
    for (const encoded of variants)
      expect(scrubProtectedOutput(JSON.stringify({ echo: encoded }), value).includes(encoded)).toBe(
        false,
      );
  },
);
