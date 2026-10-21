import { createApiClient } from "@raypx/client";
import { readAccount, type AccountState } from "@raypx/account";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { apiUrl } from "./client";

const browserClient = createApiClient({ baseUrl: apiUrl });

/** Forward only Better Auth cookies to the API, never inbound host or auth headers. */
export function sessionCookie(cookie: string | null | undefined): string {
  return (cookie ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(?:__Secure-)?better-auth[.-][^=]+=/.test(part))
    .join("; ");
}

/** SSR reads the account with this request's session; browsers send credentials. */
export const loadAccount = createIsomorphicFn()
  .server((): Promise<AccountState> => {
    const cookie = sessionCookie(getRequestHeaders().get("cookie"));
    if (!cookie) return Promise.resolve({ status: "signed-out" });
    return readAccount(createApiClient({ baseUrl: apiUrl, headers: { cookie } }));
  })
  .client(() => readAccount(browserClient));

let signedIn: Promise<AccountState> | undefined;

/**
 * Account read for the `(app)` guard. The browser reuses a signed-in result across
 * navigations; signed-out and unavailable results are always re-read.
 */
export const ensureAccount = createIsomorphicFn()
  .server(() => loadAccount())
  .client(() => {
    if (signedIn) return signedIn;
    const pending = loadAccount();
    signedIn = pending;
    void pending.then(
      (state) => {
        if (state.status !== "signed-in" && signedIn === pending) signedIn = undefined;
      },
      () => {
        if (signedIn === pending) signedIn = undefined;
      },
    );
    return pending;
  });

/** Drop the cached account before invalidating the router after sign-out. */
export function forgetAccount() {
  signedIn = undefined;
}
