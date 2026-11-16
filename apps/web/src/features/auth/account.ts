import { createApiClient } from "@raypx/client/api";
import { readAccount, type AccountState } from "@raypx/account";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { apiOrigin, apiFetch, authClient } from "./client.js";

const browserClient = createApiClient({ fetch: apiFetch });

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
    return readAccount(createApiClient({ baseUrl: apiOrigin(), headers: { cookie } }));
  })
  .client(async () => {
    try {
      const session = await authClient.getSession({
        fetchOptions: { signal: AbortSignal.timeout(10_000) },
      });
      if (session.error) return { status: "unavailable" } as const;
      if (!session.data) return { status: "signed-out" } as const;
      return readAccount(browserClient);
    } catch {
      return { status: "unavailable" } as const;
    }
  });
