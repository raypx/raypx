import { z } from "zod";
import { createEnv } from "./env";

export const env = createEnv({
  extends: [],
  client: {
    VITE_SERVER_URL: z.url(),
  },
});
