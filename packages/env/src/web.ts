import { z } from "zod";
import { createEnv } from "./envs";
import { analyticsEnv } from "./envs/analytics";
import { authEnv } from "./envs/auth";
import { emailEnv } from "./envs/email";
import { storageEnv } from "./envs/storage";

export const env = createEnv({
  clientPrefix: "VITE_",
  extends: [analyticsEnv, authEnv, emailEnv, storageEnv],
  client: {
    VITE_SERVER_URL: z.url(),
  },
  env: (import.meta as any).env,
});
