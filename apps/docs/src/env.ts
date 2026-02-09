import { createEnv, z } from "@raypx/config";

const env = createEnv({
  shared: {
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    MODE: z.string().optional(),
    NETLIFY: z.coerce.boolean().optional().default(false),
  },
  server: {
    PORT: z.coerce.number().optional().default(3000),
  },
  skip: process.env.NODE_ENV !== "production" || !!process.env.CI,
});

export default env;
