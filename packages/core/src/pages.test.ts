import { expect, it } from "vitest";
import { MAX_PAGE_BYTES, pageBodySchema } from "./pages.js";

it.each([
  { name: "ASCII", character: "x", bytes: 1 },
  { name: "two-byte text", character: "é", bytes: 2 },
  { name: "Chinese", character: "页", bytes: 3 },
  { name: "astral Unicode", character: "🙂", bytes: 4 },
  { name: "lone surrogate replacement", character: "\ud800", bytes: 3 },
])(
  "bounds Page UTF-8 bytes for $name without platform encoding globals",
  ({ character, bytes }) => {
    const count = Math.floor(MAX_PAGE_BYTES / bytes);
    const body = character.repeat(count) + "x".repeat(MAX_PAGE_BYTES % bytes);
    expect(pageBodySchema.safeParse(body).success).toBe(true);
    expect(pageBodySchema.safeParse(body + "x").success).toBe(false);
  },
);
