import { normalizeTrustedOrigins } from "@raypx/auth/origins";
import { defineEnv, type Preset, z } from "@raypx-kit/env";
import type apiEnvironmentSources from "./env.contract.js";
const server = {
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    )
    .pipe(z.array(z.email())),
  JOBS_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5433/raypx_foundation"),
  AUTH_URL: z.url().default("http://localhost:3002"),
  AUTH_SECRET: z.string().min(32).default("raypx-development-only-secret-32-characters"),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:5173,views://main,raypx://"),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  MAIL_DEFAULT_LOCALE: z.enum(["en", "zh"]).default("en"),
  AUTH_DOMAIN: z.string().min(1).optional(),
  AUTH_IP_HEADERS: z.string().optional(),
  AUTH_TRUSTED_PROXIES: z.string().optional(),
  REDIS_URL: z.url().optional(),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default("auto"),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
  POSTHOG_HOST: z.url().optional(),
} satisfies Record<keyof typeof apiEnvironmentSources, z.ZodType>;
const apiServerEnv = { id: "api", server } as const satisfies Preset;
const list = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export function getApiEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  const env = defineEnv({ extends: [apiServerEnv], runtimeEnv, isServer: true });
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
  const s3 = [env.S3_ENDPOINT, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY];
  if (s3.some(Boolean) && !s3.every(Boolean))
    throw new Error(
      "Object storage requires S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY",
    );
  return {
    ...env,
    s3:
      env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
        ? {
            endpoint: env.S3_ENDPOINT,
            region: env.S3_REGION,
            bucket: env.S3_BUCKET,
            accessKeyId: env.S3_ACCESS_KEY_ID,
            secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
    allowedOrigins: normalizeTrustedOrigins(env.ALLOWED_ORIGINS.split(",")),
    ipAddressHeaders: list(env.AUTH_IP_HEADERS).map((v) => v.toLowerCase()),
    trustedProxies: list(env.AUTH_TRUSTED_PROXIES),
  };
}
export type ApiEnvironment = ReturnType<typeof getApiEnvironment>;
