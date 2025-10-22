import { createAuthClient } from "better-auth/react";

export type AuthClientType = ReturnType<typeof createAuthClient>;

export type AnyAuthClient = Omit<AuthClientType, "getSession" | "signUp">;

export const auth: AuthClientType = createAuthClient({
  // baseURL: "/api/auth",
});
