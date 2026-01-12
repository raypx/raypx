import { createClient } from "@raypx/auth/client";
import { env } from "../env";

export const authClient = createClient(env.VITE_AUTH_URL);

export const { signIn, signUp, signOut, useSession, getSession, organization, twoFactor } =
  authClient;
