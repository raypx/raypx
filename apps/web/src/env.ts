import { z } from "zod";

const env = {
  NODE_ENV: (process.env.NODE_ENV as "development" | "production") ?? "development",
  PORT: Number(process.env.PORT ?? 3001),
} as const;

export default env;
