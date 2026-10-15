import { createAuthClient } from "@raypx/auth/client";
import { createApiClient } from "@raypx/client";

export const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3002";
export const webUrl = import.meta.env.VITE_WEB_URL || "http://localhost:3000";
export const authClient = createAuthClient({ baseURL: apiUrl });
export const apiClient = createApiClient({ baseUrl: apiUrl });
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
