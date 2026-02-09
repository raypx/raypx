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
 * Create a sign-up form schema with support for email, username (optional), password and confirm password
 */
export function createSignUpFormSchema(options: SignUpFormSchemaOptions = {}) {
  const { usernameEnabled = false, passwordValidation } = options;

  const baseSchema = z.object({
    email: z.string().email({
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
    confirmPassword: z.string().min(1, {
      message: "Please confirm your password",
    }),
  });

  // Add username field if enabled
  if (usernameEnabled) {
    return baseSchema
      .extend({
        username: z.string().min(1, {
          message: "Username is required",
        }),
      })
      .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
  }

  // Add password confirmation validation
  return baseSchema.refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
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
