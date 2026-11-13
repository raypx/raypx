import { expect, it } from "vitest";
import { createMemoryRateLimiter } from "./rate-limit.js";

it("counts a fixed window in memory without moving a full window's start", async () => {
  let time = 1_000_000;
  const limit = createMemoryRateLimiter(() => time);
  const rule = { window: 60, max: 2 };
  expect(await limit("a", rule)).toBe(true);
  time += 30_000;
  expect(await limit("a", rule)).toBe(true);
  expect(await limit("a", rule)).toBe(false);
  expect(await limit("b", rule)).toBe(true);
  // A rejected call does not extend the window: it reopens 60 s after the last counted one.
  time += 59_999;
  expect(await limit("a", rule)).toBe(false);
  time += 1;
  expect(await limit("a", rule)).toBe(true);
});
