import { describe, expect, it } from "vite-plus/test";

import { isChunkLoadError, shouldRetryChunkLoad } from "./chunk-recovery";

describe("chunk recovery", () => {
  it.each([
    "Failed to fetch dynamically imported module: /signup.tsx",
    "Importing a module script failed.",
    "error loading dynamically imported module",
  ])("recognizes a route chunk load failure: %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("does not treat application errors as chunk failures", () => {
    expect(isChunkLoadError(new Error("User not found"))).toBe(false);
    expect(isChunkLoadError({ message: "Failed to fetch" })).toBe(false);
  });

  it.each([
    ["first retry", null, true],
    ["stale retry", record("/signup", 1_000), true],
    ["same URL within the window", record("/signup", 15_000), false],
    ["invalid record", "not-json", false],
    ["future record", record("/signup", 21_000), false],
    ["different URL", record("/login", 19_000), true],
  ] as const)("handles %s", (_name, previous, expected) => {
    expect(shouldRetryChunkLoad({ previous, url: "/signup", now: 20_000 })).toBe(expected);
  });
});

function record(url: string, attemptedAt: number) {
  return JSON.stringify({ url, attemptedAt });
}
