import { expect, it } from "vitest";
import { memberTextParts } from "./page-reference.js";

it.each(["https://web.example.test", "https://api.example.test"])(
  "matches stored absolute references against the effective API origin %s",
  (origin) => {
    const stored = `[Pages](${origin}/page-content/member/space-one/page-one)`;
    expect(memberTextParts(stored, origin, "space-one")).toEqual([
      { kind: "page", id: "page-one", text: stored, start: 0, end: stored.length },
    ]);
    expect(memberTextParts(stored, "https://other.example.test", "space-one")[0]?.kind).toBe(
      "text",
    );
    expect(memberTextParts(stored, origin, "space-two")[0]?.kind).toBe("text");
  },
);
