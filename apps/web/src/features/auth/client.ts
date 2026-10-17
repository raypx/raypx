import { createAuthClient } from "@raypx/auth/client";
import { createApiClient } from "@raypx/client";

export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
export const webUrl = typeof window === "undefined" ? "" : window.location.origin;
export const authClient = createAuthClient({ baseURL: apiUrl });
export const apiClient = createApiClient({ baseUrl: apiUrl });
