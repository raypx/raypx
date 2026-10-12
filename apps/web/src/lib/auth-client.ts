import { createAuthClient } from "better-auth/react";

import { env } from "../env";

export const authClient = createAuthClient({
  ...(env.VITE_API_URL ? { baseURL: env.VITE_API_URL } : {}),
  basePath: "/api/auth",
  fetchOptions: { credentials: "include" },
});

export const { signIn, signUp, signOut, useSession } = authClient;
