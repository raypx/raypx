import { z } from "zod";
import { createEnv } from "./envs";

export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [],
  client: {
    VITE_SERVER_URL: z.url(),
  },
  env: (import.meta as any).env,
});
