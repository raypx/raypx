import type { AuthActionError } from "../hooks.js";

export type AuthMode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export interface AuthLink {
  /** Email prefilled by the link that opened the form. */
  email: string;
  /** Password reset token from the emailed link. */
  token: string;
  /** The auth server returned to this page with an error. */
  failed: boolean;
  /** The reset link cannot be used; offer a new one instead of the form. */
  invalidReset: boolean;
  /** Email verification already finished, so there is nothing to submit. */
  verified: boolean;
}

/** Reads the URL state that annotates or replaces the form before any request. */
export function readAuthLink(
  mode: AuthMode,
  search: string,
  error: AuthActionError | null,
): AuthLink {
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";
  const failed = params.has("error");
  const invalidReset =
    mode === "reset-password" &&
    (!token.trim() || failed || (error?.kind === "auth" && error.key === "invalidLink"));
  return {
    email: params.get("email") ?? "",
    token,
    failed,
    invalidReset,
    verified: mode === "verify-email" && params.get("verified") === "1" && !failed,
  };
}
