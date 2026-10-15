import { createEnv, type Preset, z } from "@voidmix/env";
export const apiServerEnv = {
  id: "api",
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5433/raypx_foundation"),
    AUTH_URL: z.url().default("http://localhost:3002"),
    AUTH_SECRET: z.string().min(32).default("raypx-development-only-secret-32-characters"),
    ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:3000,http://localhost:5173,views://main,raypx://"),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().optional(),
    MAIL_DEFAULT_LOCALE: z.enum(["en", "zh"]).default("en"),
  },
} as const satisfies Preset;
export function getApiEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  const env = createEnv({ extends: [apiServerEnv], runtimeEnv });
  if (env.NODE_ENV === "production") {
    if (
      !runtimeEnv.DATABASE_URL ||
      !runtimeEnv.AUTH_URL ||
      !runtimeEnv.AUTH_SECRET ||
      !runtimeEnv.ALLOWED_ORIGINS
    )
      throw new Error(
        "Production requires DATABASE_URL, AUTH_URL, AUTH_SECRET and ALLOWED_ORIGINS",
      );
    if (env.AUTH_SECRET.startsWith("raypx-development"))
      throw new Error("Production AUTH_SECRET must be explicitly configured");
    if (new URL(env.AUTH_URL).protocol !== "https:")
      throw new Error("Production AUTH_URL must use HTTPS");
  }
  return {
    ...env,
    allowedOrigins: env.ALLOWED_ORIGINS.split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  };
}
export type ApiEnvironment = ReturnType<typeof getApiEnvironment>;
