import { createAuthClient } from "@raypx/auth/client";
import { createDesktopFetch } from "../../lib/api-fetch.js";
import { readDesktopConnection } from "../../lib/connection.js";
import { originRecovery } from "@raypx/client/api";

export const { apiUrl, webUrl } = readDesktopConnection();
export const desktopRecovery = originRecovery(apiUrl, createDesktopFetch(apiUrl));
export const desktopFetch = desktopRecovery.fetch;
export const authClient = createAuthClient({
  baseURL: apiUrl,
  fetchOptions: { customFetchImpl: desktopFetch },
});
