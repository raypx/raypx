import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { createWebApiClient } from "./api-client";
import { sessionHeaders } from "./session-headers";

/** Each SSR request owns its client and cookie closure. Browser requests use credentials. */
export const createRouteApiClient = createIsomorphicFn()
  .server(() => createWebApiClient({ headers: sessionHeaders(getRequestHeaders()) }))
  .client(() => createWebApiClient());
