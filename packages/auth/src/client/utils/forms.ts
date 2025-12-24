import * as z from "zod";
import { getPasswordSchema } from "./password";

export type SignInFormSchemaOptions = {
  usernameEnabled?: boolean;
  passwordValidation?: {
    minLength?: number;
    maxLength?: number;
    regex?: RegExp;
  };
  rememberMeEnabled?: boolean;
};

/**
 * Create a sign-in form schema with support for username/email and password
 */
export function createSignInFormSchema(options: SignInFormSchemaOptions = {}) {
  const { usernameEnabled = false, passwordValidation, rememberMeEnabled = false } = options;

  return z.object({
    email: usernameEnabled
      ? z.string().min(1, {
          message: "Username is required",
        })
      : z.email({
          message: "Email is invalid",
        }),
    password: getPasswordSchema(
      {
        minLength: passwordValidation?.minLength || 8,
        maxLength: passwordValidation?.maxLength || 100,
        regex: passwordValidation?.regex,
      },
      {
        PASSWORD_REQUIRED: "Password is required",
        PASSWORD_TOO_SHORT: `Password must be at least ${passwordValidation?.minLength || 8} characters`,
        PASSWORD_TOO_LONG: `Password must be less than ${passwordValidation?.maxLength || 100} characters`,
      },
    ),
    rememberMe: rememberMeEnabled ? z.boolean().optional() : z.boolean().optional(),
  });
}

export type SignUpFormSchemaOptions = {
  usernameEnabled?: boolean;
  passwordValidation?: {
    minLength?: number;
    maxLength?: number;
    regex?: RegExp;
  };
  rememberMeEnabled?: boolean;
};

/**
 * Create a sign-up form schema with support for username/email and password
 */
export function createSignUpFormSchema(options: SignUpFormSchemaOptions = {}) {
  const { usernameEnabled = false, passwordValidation, rememberMeEnabled = false } = options;

  return z.object({
    name: z
      .string()
      .trim()
      .min(1, {
        message: "Name is required",
      })
      .max(255, {
        message: "Name is too long",
      })
      .optional(),
    email: usernameEnabled
      ? z.string().min(1, {
          message: "Username is required",
        })
      : z.string().email({
          message: "Email is invalid",
        }),
    password: getPasswordSchema(
      {
        minLength: passwordValidation?.minLength || 8,
        maxLength: passwordValidation?.maxLength || 100,
        regex: passwordValidation?.regex,
      },
      {
        PASSWORD_REQUIRED: "Password is required",
        PASSWORD_TOO_SHORT: `Password must be at least ${passwordValidation?.minLength || 8} characters`,
        PASSWORD_TOO_LONG: `Password must be less than ${passwordValidation?.maxLength || 100} characters`,
      },
    ),
    rememberMe: rememberMeEnabled ? z.boolean().optional() : z.boolean().optional(),
  });
}

/**
 * Get default form values for sign-in/sign-up forms
 */
export function getSignInFormDefaults(rememberMeEnabled = false) {
  return {
    email: "",
    password: "",
    rememberMe: !rememberMeEnabled,
  };
}

/**
 * Get default form values for sign-up forms
 */
export function getSignUpFormDefaults(rememberMeEnabled = false) {
  return {
    name: "",
    email: "",
    password: "",
    rememberMe: !rememberMeEnabled,
  };
}
