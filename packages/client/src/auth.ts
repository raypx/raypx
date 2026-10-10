import {
  signInSchema,
  signUpSchema,
  authAccountResponseSchema,
  signOutResponseSchema,
  currentUserResponseSchema,
  type SignInInput,
  type SignUpInput,
} from "@raypx/contracts/auth";
import { ApiClientError } from "./errors.js";
import { requestJson } from "./http.js";

type AuthRequestOptions = { signal?: AbortSignal };
function validate<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ApiClientError("invalid-request", "Invalid account details");
  return result.data;
}
/** Signs in with cookies on the same origin. Writes are never automatically retried. */
export function signIn(input: SignInInput, options: AuthRequestOptions = {}) {
  const body = validate(signInSchema, input);
  return requestJson({
    path: "/api/auth/sign-in/email",
    method: "POST",
    body,
    schema: authAccountResponseSchema,
    signal: options.signal,
  });
}
/** Creates an email/password account and returns only public account information. */
export function signUp(input: SignUpInput, options: AuthRequestOptions = {}) {
  const body = validate(signUpSchema, input);
  return requestJson({
    path: "/api/auth/sign-up/email",
    method: "POST",
    body,
    schema: authAccountResponseSchema,
    signal: options.signal,
  });
}
/** Revokes the current session and clears its cookie. */
export function signOut(options: AuthRequestOptions = {}) {
  return requestJson({
    path: "/api/auth/sign-out",
    method: "POST",
    body: {},
    schema: signOutResponseSchema,
    signal: options.signal,
  });
}
/** Requests a protected account endpoint; anonymous callers receive a typed 401. */
export function getCurrentUser(options: AuthRequestOptions = {}) {
  return requestJson({
    path: "/api/me",
    schema: currentUserResponseSchema,
    signal: options.signal,
  });
}
