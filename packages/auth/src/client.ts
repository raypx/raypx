"use client";

import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export function createClient(baseURL?: string) {
  const client = createAuthClient({
    baseURL,
    plugins: [twoFactorClient(), organizationClient()],
  });

  return client;
}

// Default client instance (baseURL from env should be passed at app level)
export type AuthClient = ReturnType<typeof createClient>;
