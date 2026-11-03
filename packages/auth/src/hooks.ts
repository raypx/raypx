import { useCallback, useRef, useState } from "react";
import type { SocialProvider } from "./types";

export type AuthErrorKey =
  | "registrationDisabled"
  | "mailUnavailable"
  | "invalidCredentials"
  | "emailNotVerified"
  | "emailTaken"
  | "passwordShort"
  | "passwordLong"
  | "invalidName"
  | "currentPasswordInvalid"
  | "passwordUnavailable"
  | "sessionUnauthorized"
  | "rateLimited"
  | "invalidLink"
  | "generic";

export type AuthActionError =
  | { kind: "auth"; key: AuthErrorKey; retryAfterSeconds?: number }
  | { kind: "network" }
  | { kind: "completion" };

export type AuthActionResult =
  | { status: "success" }
  | { status: "ignored" }
  | { status: "error"; error: AuthActionError };

export type AuthActionSuccess = () => void | Promise<unknown>;

export interface AuthActionResponse {
  error?: { code?: string | undefined; status?: number | undefined } | null | undefined;
  retryAfterSeconds?: number;
}

type RequestOptions = {
  fetchOptions: {
    headers: Record<string, string>;
    onError?: (context: { response: Response }) => void;
  };
};
type Credentials = { email: string; password: string };

/** The common email/password methods provided by browser and native auth clients. */
export interface AuthActionClient {
  signIn: {
    email(input: Credentials & RequestOptions): Promise<AuthActionResponse>;
    social?(
      input: {
        provider: SocialProvider;
        callbackURL: string;
        errorCallbackURL: string;
      } & RequestOptions,
    ): Promise<AuthActionResponse>;
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

export interface PasswordChangeClient {
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
    fetchOptions: { signal: AbortSignal };
  }): Promise<AuthActionResponse>;
}

function authErrorKey({ code, status }: NonNullable<AuthActionResponse["error"]>): AuthErrorKey {
  if (status === 429 || code === "TOO_MANY_REQUESTS") return "rateLimited";
  if (code === "REGISTRATION_DISABLED") return "registrationDisabled";
  if (code === "MAIL_NOT_CONFIGURED") return "mailUnavailable";
  if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_PASSWORD")
    return "invalidCredentials";
  if (code === "EMAIL_NOT_VERIFIED") return "emailNotVerified";
  if (code === "USER_ALREADY_EXISTS" || code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    return "emailTaken";
  if (code === "PASSWORD_TOO_SHORT") return "passwordShort";
  if (code === "PASSWORD_TOO_LONG") return "passwordLong";
  if (code === "INVALID_NAME") return "invalidName";
  if (code === "CURRENT_PASSWORD_INVALID") return "currentPasswordInvalid";
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return "passwordUnavailable";
  if (code === "UNAUTHORIZED" || code === "SESSION_EXPIRED") return "sessionUnauthorized";
  if (code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED") return "invalidLink";
  return "generic";
}

async function mailRequest(
  request: (fetchOptions: RequestOptions["fetchOptions"]) => Promise<AuthActionResponse>,
  fetchOptions: RequestOptions["fetchOptions"],
): Promise<AuthActionResponse> {
  let retryAfterSeconds: number | undefined;
  const result = await request({
    ...fetchOptions,
    onError: ({ response }) => {
      if (response.status !== 429) return;
      // Better Auth 1.7 uses X-Retry-After; standard Retry-After also accepts an HTTP date.
      const value = response.headers.get("Retry-After") ?? response.headers.get("X-Retry-After");
      if (!value) return;
      const seconds = Math.ceil(
        /^\d+$/.test(value) ? Number(value) : (Date.parse(value) - Date.now()) / 1000,
      );
      if (Number.isSafeInteger(seconds) && seconds >= 0) retryAfterSeconds = Math.max(1, seconds);
    },
  });
  return retryAfterSeconds === undefined ? result : { ...result, retryAfterSeconds };
}

function useAuthRequest() {
  const active = useRef(false);
  // Only retain the follow-up, never the request closure that contains credentials.
  const completion = useRef<AuthActionSuccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthActionError | null>(null);

  const clearError = useCallback(() => {
    completion.current = null;
    setError(null);
  }, []);
  const run = useCallback(
    async (
      request: () => Promise<AuthActionResponse>,
      onSuccess?: AuthActionSuccess,
    ): Promise<AuthActionResult> => {
      // React state alone cannot prevent two actions started in the same event tick.
      if (active.current) return { status: "ignored" };
      active.current = true;
      completion.current = null;
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
        if (result.error)
          return fail({
            kind: "auth",
            key: authErrorKey(result.error),
            ...(result.retryAfterSeconds === undefined
              ? {}
              : { retryAfterSeconds: result.retryAfterSeconds }),
          });
        try {
          await onSuccess?.();
        } catch {
          // The authentication succeeded; a failed follow-up must not repeat it.
          completion.current = onSuccess ?? null;
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
  const retryCompletion = useCallback((): Promise<AuthActionResult> => {
    if (!completion.current) return Promise.resolve({ status: "ignored" });
    return run(async () => ({}), completion.current);
  }, [run]);
  return { busy, error, clearError, run, retryCompletion };
}

/** Shared auth actions; navigation, translations and session ownership stay with callers. */
export function useAuthActions({
  client,
  webUrl,
  locale,
  callbackURLs,
}: {
  client: AuthActionClient;
  webUrl: string;
  locale?: string;
  callbackURLs?: { verify: string; reset: string };
}) {
  const { run, ...state } = useAuthRequest();
  const fetchOptions: RequestOptions["fetchOptions"] = {
    headers: locale ? { "Accept-Language": locale } : {},
  };
  const callbackURL = callbackURLs?.verify ?? `${webUrl}/verify-email?verified=1`;

  return {
    ...state,
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
          mailRequest(
            (options) =>
              client.requestPasswordReset({
                email: input.email.trim(),
                redirectTo: callbackURLs?.reset ?? `${webUrl}/reset-password`,
                fetchOptions: options,
              }),
            fetchOptions,
          ),
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
          mailRequest(
            (options) =>
              client.sendVerificationEmail({
                email: input.email.trim(),
                callbackURL,
                fetchOptions: options,
              }),
            fetchOptions,
          ),
        onSuccess,
      );
    },
    signInSocial(input: {
      provider: SocialProvider;
      callbackURL: string;
      errorCallbackURL: string;
    }) {
      return run(() =>
        client.signIn.social
          ? client.signIn.social({ ...input, fetchOptions })
          : Promise.resolve({ error: { code: "PROVIDER_NOT_FOUND" } }),
      );
    },
    completeSocialSignIn: (onSuccess: AuthActionSuccess) => run(async () => ({}), onSuccess),
    signOut(onSuccess?: AuthActionSuccess) {
      return run(() => client.signOut(), onSuccess);
    },
  };
}

/** Kept separate so email/password login clients do not need account-setting methods. */
export function usePasswordChange(client: PasswordChangeClient) {
  const { run, ...state } = useAuthRequest();
  return {
    ...state,
    changePassword(
      input: { currentPassword: string; newPassword: string; revokeOtherSessions: boolean },
      onSuccess?: AuthActionSuccess,
    ) {
      return run(async () => {
        const response = await client.changePassword({
          ...input,
          fetchOptions: { signal: AbortSignal.timeout(15_000) },
        });
        return response.error?.code === "INVALID_PASSWORD"
          ? { error: { code: "CURRENT_PASSWORD_INVALID" } }
          : response;
      }, onSuccess);
    },
  };
}
