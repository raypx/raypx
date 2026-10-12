import { describe, expect, it } from "vite-plus/test";

import {
  createPasswordResetCallbackUrl,
  createVerificationCallbackUrl,
  normalizeAuthRedirect,
  validateAuthSearch,
} from "./route-search";

describe("authentication route search", () => {
  it("keeps internal destinations including their query and hash", () => {
    expect(normalizeAuthRedirect("/admin?tab=users#invite")).toBe("/admin?tab=users#invite");
    expect(validateAuthSearch({ redirect: "/admin" })).toEqual({ redirect: "/admin" });
  });

  it.each([
    "https://example.com/account",
    "//example.com/account",
    "/\\\\example.com/account",
    " /admin",
    "/admin\n",
    42,
    null,
  ])("rejects unsafe auth destinations: %j", (value) => {
    expect(normalizeAuthRedirect(value)).toBeUndefined();
  });

  it("drops an invalid redirect from the validated search object", () => {
    expect(validateAuthSearch({ redirect: "https://example.com" })).toEqual({});
  });

  it("builds a same-origin verification callback and preserves a safe destination", () => {
    expect(createVerificationCallbackUrl("https://voidmix.example", "/admin?tab=users")).toBe(
      "https://voidmix.example/verify-email?verified=1&redirect=%2Fadmin%3Ftab%3Dusers",
    );
  });

  it("adds a safe destination to the password reset callback", () => {
    expect(createPasswordResetCallbackUrl("https://voidmix.example", "/admin")).toBe(
      "https://voidmix.example/reset-password?redirect=%2Fadmin",
    );
  });
});
