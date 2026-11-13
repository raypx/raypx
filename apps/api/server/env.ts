import { normalizeTrustedOrigins } from "@raypx/core/auth";
import { defineEnv, type Preset, z } from "@raypx/env";
import type apiEnvironmentSources from "./env.contract.js";
const server = {
  SERVER_ROLE: z.enum(["api", "both"]).default("both"),
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
  DATABASE_MIGRATE_ON_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  DATABASE_URL: z.url().default("postgres://postgres:postgres@localhost:5433/raypx_foundation"),
  AUTH_URL: z.url().default("http://localhost:3002"),
  AUTH_SECRET: z.string().min(32).default("raypx-development-only-secret-32-characters"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:5173,views://main,raypx://"),
  AUTH_DOMAIN: z.string().min(1).optional(),
  AUTH_IP_HEADERS: z.string().optional(),
  AUTH_TRUSTED_PROXIES: z.string().optional(),
  REDIS_URL: z.url().optional(),
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
  if (env.SERVER_ROLE === "api" && !env.REDIS_URL)
    throw new Error("The api role requires REDIS_URL; use both for a single backend");
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
  for (const provider of ["GOOGLE", "GITHUB"] as const) {
    if (Boolean(env[`${provider}_CLIENT_ID`]) !== Boolean(env[`${provider}_CLIENT_SECRET`]))
      throw new Error(
        `${provider} login requires both ${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET`,
      );
  }
  return {
    ...env,
    allowedOrigins: normalizeTrustedOrigins(env.ALLOWED_ORIGINS.split(",")),
    ipAddressHeaders: list(env.AUTH_IP_HEADERS).map((v) => v.toLowerCase()),
    trustedProxies: list(env.AUTH_TRUSTED_PROXIES),
  };
}
export type ApiEnvironment = ReturnType<typeof getApiEnvironment>;

export function getServerRole(runtimeEnv: Record<string, string | undefined> = process.env) {
  return z.enum(["api", "relay", "both"]).parse(runtimeEnv.SERVER_ROLE || "both");
}

/** Relay intentionally never parses authentication, mail or signing configuration. */
export function getRelayEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  const env = defineEnv({
    isServer: true,
    runtimeEnv,
    server: {
      NODE_ENV: server.NODE_ENV,
      DATABASE_URL: z.url(),
      REDIS_URL: z.url(),
      ALLOWED_ORIGINS: z.string().min(1),
    },
  });
  if (!/^postgres(?:ql)?:$/.test(new URL(env.DATABASE_URL).protocol))
    throw new Error("Invalid Relay database protocol");
  if (!/^rediss?:$/.test(new URL(env.REDIS_URL).protocol))
    throw new Error("Invalid Relay broker protocol");
  if (env.ALLOWED_ORIGINS.includes("*")) throw new Error("Relay requires exact allowed origins");
  const allowedOrigins = normalizeTrustedOrigins(env.ALLOWED_ORIGINS.split(","));
  if (!allowedOrigins.length) throw new Error("Relay requires allowed origins");
  return { ...env, allowedOrigins };
}
export type RelayEnvironment = ReturnType<typeof getRelayEnvironment>;
