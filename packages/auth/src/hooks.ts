import { useCallback, useRef, useState } from "react";

export type AuthErrorKey =
  | "mailUnavailable"
  | "invalidCredentials"
  | "emailNotVerified"
  | "emailTaken"
  | "passwordShort"
  | "rateLimited"
  | "invalidLink"
  | "generic";

export type AuthActionError =
  | { kind: "auth"; key: AuthErrorKey }
  | { kind: "network" }
  | { kind: "completion" };

export type AuthActionResult =
  | { status: "success" }
  | { status: "ignored" }
  | { status: "error"; error: AuthActionError };

export type AuthActionSuccess = () => void | Promise<unknown>;

export interface AuthActionResponse {
  error?: { code?: string | undefined } | null | undefined;
}

type RequestOptions = { fetchOptions: { headers: Record<string, string> } };
type Credentials = { email: string; password: string };

/** The common email/password methods provided by browser and native auth clients. */
export interface AuthActionClient {
  signIn: {
    email(input: Credentials & RequestOptions): Promise<AuthActionResponse>;
  };
  signUp: {
    email(
      input: Credentials & { name: string; callbackURL: string } & RequestOptions,
    ): Promise<AuthActionResponse>;
  };
  requestPasswordReset(
    input: { email: string; redirectTo: string } & RequestOptions,
  ): Promise<AuthActionResponse>;
  resetPassword(
    input: { token: string; newPassword: string } & RequestOptions,
  ): Promise<AuthActionResponse>;
  sendVerificationEmail(
    input: { email: string; callbackURL: string } & RequestOptions,
  ): Promise<AuthActionResponse>;
  signOut(): Promise<AuthActionResponse>;
}

function authErrorKey(code?: string): AuthErrorKey {
  if (code === "MAIL_NOT_CONFIGURED") return "mailUnavailable";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD")
    return "invalidCredentials";
  if (code === "EMAIL_NOT_VERIFIED") return "emailNotVerified";
  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    return "emailTaken";
  if (code === "PASSWORD_TOO_SHORT") return "passwordShort";
  if (code === "TOO_MANY_REQUESTS") return "rateLimited";
  if (code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED") return "invalidLink";
  return "generic";
}

/** Shared auth actions; navigation, translations and session ownership stay with callers. */
export function useAuthActions({
  client,
  webUrl,
  locale,
}: {
  client: AuthActionClient;
  webUrl: string;
  locale?: string;
}) {
  const active = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthActionError | null>(null);

  const clearError = useCallback(() => setError(null), []);
  const run = useCallback(
    async (
      request: () => Promise<AuthActionResponse>,
      onSuccess?: AuthActionSuccess,
    ): Promise<AuthActionResult> => {
      // React state alone cannot prevent two actions started in the same event tick.
      if (active.current) return { status: "ignored" };
      active.current = true;
      setBusy(true);
      setError(null);
      const fail = (failure: AuthActionError): AuthActionResult => {
        setError(failure);
        return { status: "error", error: failure };
      };
      try {
        let result: AuthActionResponse;
        try {
          result = await request();
        } catch {
          return fail({ kind: "network" });
        }
        if (result.error) return fail({ kind: "auth", key: authErrorKey(result.error.code) });
        try {
          await onSuccess?.();
        } catch {
          // The authentication succeeded; a failed follow-up must not repeat it.
          return fail({ kind: "completion" });
        }
        return { status: "success" };
      } finally {
        active.current = false;
        setBusy(false);
      }
    },
    [],
  );
  const fetchOptions: RequestOptions["fetchOptions"] = {
    headers: locale ? { "Accept-Language": locale } : {},
  };
  const callbackURL = `${webUrl}/verify-email?verified=1`;

  return {
    busy,
    error,
    clearError,
    signIn(input: Credentials, onSuccess?: AuthActionSuccess) {
      return run(
        () =>
          client.signIn.email({
            email: input.email.trim(),
            password: input.password,
            fetchOptions,
          }),
        onSuccess,
      );
    },
    signUp(input: Credentials & { name: string }, onSuccess?: AuthActionSuccess) {
      return run(
        () =>
          client.signUp.email({
            name: input.name.trim(),
            email: input.email.trim(),
            password: input.password,
            callbackURL,
            fetchOptions,
          }),
        onSuccess,
      );
    },
    requestPasswordReset(input: { email: string }, onSuccess?: AuthActionSuccess) {
      return run(
        () =>
          client.requestPasswordReset({
            email: input.email.trim(),
            redirectTo: `${webUrl}/reset-password`,
            fetchOptions,
          }),
        onSuccess,
      );
    },
    resetPassword(input: { token: string; newPassword: string }, onSuccess?: AuthActionSuccess) {
      return run(
        () =>
          client.resetPassword({
            token: input.token,
            newPassword: input.newPassword,
            fetchOptions,
          }),
        onSuccess,
      );
    },
    sendVerificationEmail(input: { email: string }, onSuccess?: AuthActionSuccess) {
      return run(
        () =>
          client.sendVerificationEmail({ email: input.email.trim(), callbackURL, fetchOptions }),
        onSuccess,
      );
    },
    signOut(onSuccess?: AuthActionSuccess) {
      return run(() => client.signOut(), onSuccess);
    },
  };
}
