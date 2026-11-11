import { createAuthClient } from "@raypx/auth/client";
import { createDesktopFetch } from "../../lib/api-fetch.js";
import { readDesktopConnection } from "../../lib/connection.js";

export const { apiUrl, webUrl } = readDesktopConnection();
export const desktopFetch = createDesktopFetch(apiUrl);
export const authClient = createAuthClient({
  baseURL: apiUrl,
  fetchOptions: { customFetchImpl: desktopFetch },
});
