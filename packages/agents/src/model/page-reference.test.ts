import { expect, it } from "vitest";
import { memberTextParts } from "./page-reference.js";

it.each(["https://web.example.test", "https://api.example.test"])(
  "matches stored absolute references against the effective API origin %s",
  (origin) => {
    const stored = `[Pages](${origin}/api/pages/member/space-one/page-one)`;
    expect(memberTextParts(stored, origin, "space-one")).toEqual([
      { kind: "page", id: "page-one", text: stored, start: 0, end: stored.length },
    ]);
    expect(memberTextParts(stored, "https://other.example.test", "space-one")[0]?.kind).toBe(
      "text",
    );
    expect(memberTextParts(stored, origin, "space-two")[0]?.kind).toBe("text");
  },
);

it("leaves earlier stored member URLs as plain text without migration", () => {
  const text = "[Pages](https://api.example.test/page-content/member/space-one/page-one)";
  expect(memberTextParts(text, "https://api.example.test", "space-one")).toEqual([
    { kind: "text", text, start: 0, end: text.length },
  ]);
});
