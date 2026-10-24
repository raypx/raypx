import { createAuthClient } from "@raypx/auth/client";
import { createDesktopFetch } from "../../lib/api-fetch";

export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
export const webUrl = import.meta.env.VITE_WEB_URL || "http://localhost:3000";
export const desktopFetch = createDesktopFetch(apiUrl);
export const authClient = createAuthClient({
  baseURL: apiUrl,
  fetchOptions: { customFetchImpl: desktopFetch },
});
