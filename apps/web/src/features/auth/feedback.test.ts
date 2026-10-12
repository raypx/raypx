import { describe, expect, it } from "vite-plus/test";
import { getAuthErrorMessage } from "./feedback";

const translateError = (key: string) => `errors.${key}`;

describe("auth feedback", () => {
  it.each([
    ["registration policy code", { code: "REGISTRATION_DISABLED" }, "errors.registrationDisabled"],
    ["email domain code", { code: "EMAIL_DOMAIN_NOT_ALLOWED" }, "errors.emailDomainNotAllowed"],
    [
      "known code before server prose",
      { code: "PASSWORD_RESET_DISABLED", message: "Password reset email delivery is disabled." },
      "errors.passwordResetDisabled",
    ],
    [
      "unknown code with prose",
      { code: "SOMETHING_NEW", message: "Invalid email or password" },
      "Fallback",
    ],
    ["prose without a code", { message: "Invalid email or password" }, "Fallback"],
    ["request error", new Error("Request failed"), "Fallback"],
  ])("uses safe translated feedback for %s", (_name, error, expected) => {
    expect(getAuthErrorMessage(error, "Fallback", translateError)).toBe(expected);
  });
  it.each([
    ["empty error", { message: "" }],
    ["null error", null],
    ["browser transport error", new TypeError("Failed to fetch")],
  ])("uses the supplied fallback for %s", (_name, error) => {
    expect(getAuthErrorMessage(error, "Unable to sign in.", translateError)).toBe(
      "Unable to sign in.",
    );
  });
});
