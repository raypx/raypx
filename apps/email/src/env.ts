import { createEnv, emailEnv, z } from "@raypx/config";

const env = createEnv({
  extends: [emailEnv],
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    MODE: z.string().optional(),
  },
  server: {
    PORT: z.coerce.number().optional().default(3002),
  },
  skip: process.env.NODE_ENV !== "production" || !!process.env.CI,
});

export default env;
