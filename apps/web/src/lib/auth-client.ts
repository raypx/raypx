import { createClient } from "@raypx/auth/client";
import { env } from "../env";

const authClient = createClient(env.VITE_AUTH_URL);

export const { signIn, signUp, signOut, useSession } = authClient;
