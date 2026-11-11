import type { AuthActionSuccess, useAuthActions } from "../hooks.js";
import type { AuthMode, readAuthLink } from "./auth-link.js";
import { formText } from "./form-text.js";

export interface ModeConfig {
  title: "login" | "signup" | "reset" | "verify";
  intro: "intro" | "signupIntro" | "resetIntro" | "verifyIntro" | null;
  /** Submit label; `null` reuses the common sign-in action. */
  submit: "create" | "sendReset" | "reset" | "resend" | null;
  success: "verifyIntro" | "resetSent" | "resetSaved" | "verifySent" | null;
  name?: true;
  email?: true;
  password?: { purpose: "current" | "new"; label: "password" | "newPassword" };
  /** Success clears and replaces the form instead of allowing another request. */
  completes?: true;
  /** Each request sends an email and starts the resend cooldown. */
  mail?: true;
}

export const modes: Record<AuthMode, ModeConfig> = {
  login: {
    title: "login",
    intro: "intro",
    submit: null,
    success: null,
    email: true,
    password: { purpose: "current", label: "password" },
    completes: true,
  },
  signup: {
    title: "signup",
    intro: "signupIntro",
    submit: "create",
    success: "verifyIntro",
    name: true,
    email: true,
    password: { purpose: "new", label: "password" },
  },
  "forgot-password": {
    title: "reset",
    intro: "resetIntro",
    submit: "sendReset",
    success: "resetSent",
    email: true,
    mail: true,
  },
  "reset-password": {
    title: "reset",
    intro: null,
    submit: "reset",
    success: "resetSaved",
    password: { purpose: "new", label: "newPassword" },
    completes: true,
  },
  "verify-email": {
    title: "verify",
    intro: "verifyIntro",
    submit: "resend",
    success: "verifySent",
    email: true,
    mail: true,
  },
};

export function authFormTitle(
  config: ModeConfig,
  link: ReturnType<typeof readAuthLink>,
  signedIn: boolean,
  complete: boolean,
) {
  if (link.invalidReset) return "invalidLinkTitle";
  if (link.verified) return "verifiedTitle";
  if (signedIn) return "signedInTitle";
  if (complete) return "resetCompleteTitle";
  return config.title;
}

export function authSuccessMessage(config: ModeConfig, verified: boolean, succeeded: boolean) {
  if (verified) return "verified";
  if (succeeded) return config.success;
  return null;
}

export function requestMode(
  auth: ReturnType<typeof useAuthActions>,
  mode: AuthMode,
  data: FormData,
  token: string,
  onSuccess: AuthActionSuccess,
) {
  const email = formText(data, "email");
  const password = formText(data, "password");
  switch (mode) {
    case "login":
      return auth.signIn({ email, password }, onSuccess);
    case "signup":
      return auth.signUp({ name: formText(data, "name"), email, password }, onSuccess);
    case "forgot-password":
      return auth.requestPasswordReset({ email }, onSuccess);
    case "reset-password":
      return auth.resetPassword({ newPassword: password, token }, onSuccess);
    case "verify-email":
      return auth.sendVerificationEmail({ email }, onSuccess);
  }
}
