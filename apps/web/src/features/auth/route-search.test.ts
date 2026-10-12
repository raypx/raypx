import { describe, expect, it } from "vite-plus/test";

import {
  createPasswordResetCallbackUrl,
  createVerificationCallbackUrl,
  normalizeAuthRedirect,
  validateAuthSearch,
} from "./route-search";

describe("authentication route search", () => {
  it("keeps internal destinations including their query and hash", () => {
    expect(normalizeAuthRedirect("/projects?cursor=50#details")).toBe(
      "/projects?cursor=50#details",
    );
    expect(validateAuthSearch({ redirect: "/projects" })).toEqual({ redirect: "/projects" });
  });

  it.each([
    "https://example.com/account",
    "//example.com/account",
    "/\\\\example.com/account",
    " /projects",
    "/projects\n",
    42,
    null,
  ])("rejects unsafe auth destinations: %j", (value) => {
    expect(normalizeAuthRedirect(value)).toBeUndefined();
  });

  it("drops an invalid redirect from the validated search object", () => {
    expect(validateAuthSearch({ redirect: "https://example.com" })).toEqual({});
  });

  it("builds a same-origin verification callback and preserves a safe destination", () => {
    expect(createVerificationCallbackUrl("https://voidmix.example", "/projects?cursor=50")).toBe(
      "https://voidmix.example/verify-email?verified=1&redirect=%2Fprojects%3Fcursor%3D50",
    );
  });

  it("adds a safe destination to the password reset callback", () => {
    expect(createPasswordResetCallbackUrl("https://voidmix.example", "/projects")).toBe(
      "https://voidmix.example/reset-password?redirect=%2Fprojects",
    );
  });
});
