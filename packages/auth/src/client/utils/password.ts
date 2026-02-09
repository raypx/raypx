import * as z from "zod";

export type PasswordValidation = {
  /**
   * Maximum password length
   */
  maxLength?: number;

  /**
   * Minimum password length
   */
  minLength?: number;

  /**
   * Password validation regex
   */
  regex?: RegExp;
};

export type PasswordLocalization = {
  PASSWORD_REQUIRED?: string;
  PASSWORD_TOO_SHORT?: string;
  PASSWORD_TOO_LONG?: string;
  INVALID_PASSWORD?: string;
};

export function getPasswordSchema(
  passwordValidation?: PasswordValidation,
  localization?: PasswordLocalization,
) {
  let schema = z.string().min(1, {
    message: localization?.PASSWORD_REQUIRED || "Password is required",
  });

  if (passwordValidation?.minLength) {
    schema = schema.min(passwordValidation.minLength, {
      message:
        localization?.PASSWORD_TOO_SHORT ||
        `Password must be at least ${passwordValidation.minLength} characters`,
    });
  }

  if (passwordValidation?.maxLength) {
    schema = schema.max(passwordValidation.maxLength, {
      message:
        localization?.PASSWORD_TOO_LONG ||
        `Password must be less than ${passwordValidation.maxLength} characters`,
    });
  }

  if (passwordValidation?.regex) {
    schema = schema.regex(passwordValidation.regex, {
      message: localization?.INVALID_PASSWORD || "Invalid password format",
    });
  }

  return schema;
}
