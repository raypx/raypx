import { createAuthClient } from "better-auth/react";

export type AnyAuthClient = Omit<ReturnType<typeof createAuthClient>, "getSession" | "signUp">;

export const auth: ReturnType<typeof createAuthClient> = createAuthClient({
  baseURL: "/api/auth",
});
