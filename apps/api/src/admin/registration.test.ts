import { expect, it } from "vitest";
import { matchesSetupToken } from "./registration.js";
import { getApiEnvironment } from "../env.js";

it("compares fixed digests without accepting missing, truncated or different tokens", () => {
  const token = "setup-token-fixture-with-at-least-32-characters";
  expect(matchesSetupToken(token, token)).toBe(true);
  for (const supplied of ["", token.slice(1), `${token}x`, "x".repeat(token.length)])
    expect(matchesSetupToken(token, supplied)).toBe(false);
});
it("validates API-only setup token bounds and leaves the token optional", () => {
  expect(getApiEnvironment({}).SETUP_TOKEN).toBeUndefined();
  for (const token of ["short", "a".repeat(513), "a".repeat(32) + "\n"])
    expect(() => getApiEnvironment({ SETUP_TOKEN: token })).toThrow(
      "Invalid environment variables",
    );
  expect(getApiEnvironment({ SETUP_TOKEN: "a".repeat(32) }).SETUP_TOKEN).toBe("a".repeat(32));
});
