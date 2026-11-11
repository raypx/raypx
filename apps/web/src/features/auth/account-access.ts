import { createApiClient } from "@raypx/client/api";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { accessForRole } from "@raypx/account/access";
import { sessionCookie } from "./account.js";
import { apiUrl } from "./client.js";

const browserClient = createApiClient({ baseUrl: apiUrl });

/** Resolve the same permission projection during SSR and browser navigation. */
export const loadAccountAccess = createIsomorphicFn()
  .server((signal: AbortSignal) => {
    const cookie = sessionCookie(getRequestHeaders().get("cookie"));
    if (!cookie) return Promise.resolve(accessForRole("guest", null));
    return createApiClient({ baseUrl: apiUrl, headers: { cookie } }).account.access({}, { signal });
  })
  .client((signal: AbortSignal) => browserClient.account.access({}, { signal }));
