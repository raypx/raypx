import { createAuthClient } from "@raypx/auth/client";
import { createApiClient } from "@raypx/client";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
/** Email links finish in Web; they are only built from browser actions. */
export const webUrl = typeof window === "undefined" ? "" : window.location.origin;
export const authClient = createAuthClient({ baseURL: apiUrl });
const apiClient = createApiClient({ baseUrl: apiUrl });

/** Forward only Better Auth cookies to the API, never inbound host or auth headers. */
export function sessionCookie(cookie: string | null | undefined): string {
  return (cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(?:__Secure-)?better-auth[.-][^=]+=/.test(part))
    .join("; ");
}

export type AccountState =
  | { status: "signed-in"; account: { id: string; name: string; email: string } }
  | { status: "signed-out" }
  | { status: "unavailable" };

function isUnauthorized(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "UNAUTHORIZED";
}
async function readAccount(client: typeof apiClient): Promise<AccountState> {
  try {
    // A slow API must not hold server rendering open indefinitely.
    const account = await client.account.get({}, { signal: AbortSignal.timeout(5000) });
    return { status: "signed-in", account };
  } catch (error) {
    return isUnauthorized(error) ? { status: "signed-out" } : { status: "unavailable" };
  }
}
/** SSR reads the account with this request's session; browsers send credentials. */
export const loadAccount = createIsomorphicFn()
  .server((): Promise<AccountState> => {
    const cookie = sessionCookie(getRequestHeaders().get("cookie"));
    if (!cookie) return Promise.resolve({ status: "signed-out" });
    return readAccount(createApiClient({ baseUrl: apiUrl, headers: { cookie } }));
  })
  .client(() => readAccount(apiClient));

export function authErrorKey(code?: string): string {
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
