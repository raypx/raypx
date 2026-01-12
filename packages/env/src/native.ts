import { z } from "zod";
import { createEnv } from "./envs";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_SERVER_URL: z.url(),
  },
  env: process.env,
});
