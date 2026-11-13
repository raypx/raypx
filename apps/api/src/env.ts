import { normalizeTrustedOrigins } from "@raypx/core/auth";
import { defineEnv, type Preset, z } from "@raypx/env";
import type apiEnvironmentSources from "./env.contract.js";
function computerLimit(fallback: string) {
  return z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default(fallback)
    .transform(Number)
    .pipe(z.number().int().max(1000));
}
const server = {
  COMPUTER_PROVIDER: z.enum(["none", "docker"]).default("none"),
  SANDBOX_SUPERVISOR_URL: z.url().optional(),
  SANDBOX_SUPERVISOR_TOKEN: z
    .string()
    .min(32)
    .regex(/^[^\r\n]+$/)
    .optional(),
  COMPUTERS_PER_MEMBER: computerLimit("10"),
  COMPUTERS_PER_SPACE: computerLimit("1"),
  SERVER_ROLE: z.enum(["api", "both"]).default("both"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AGENT_MODELS: z.string().default("[]"),
  AGENT_MODEL_CREDENTIALS: z.string().default("{}"),
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
  /** Encrypts stored provider credentials and seeds instance signing; never the auth secret. */
  APP_KEY: z.string().min(32).default("raypx-development-only-app-key-32-characters"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:5173,views://main,raypx://"),
  AUTH_PASSKEY_RP_ID: z
    .union([z.literal(""), z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/)])
    .optional(),
  AUTH_CHECK_COMPROMISED_PASSWORDS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  AUTH_TURNSTILE_SITE_KEY: z.string().optional(),
  AUTH_TURNSTILE_SECRET_KEY: z.string().optional(),
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
  if (env.SANDBOX_SUPERVISOR_URL) {
    const url = new URL(env.SANDBOX_SUPERVISOR_URL);
    if (
      !/^https?:$/.test(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw new Error("Invalid SANDBOX_SUPERVISOR_URL");
  }
  if (env.COMPUTER_PROVIDER === "docker") {
    if (!env.SANDBOX_SUPERVISOR_URL || !env.SANDBOX_SUPERVISOR_TOKEN)
      throw new Error(
        "COMPUTER_PROVIDER=docker requires SANDBOX_SUPERVISOR_URL and SANDBOX_SUPERVISOR_TOKEN",
      );
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (
        key !== "SANDBOX_SUPERVISOR_TOKEN" &&
        (value === env.SANDBOX_SUPERVISOR_TOKEN ||
          value?.includes(JSON.stringify(env.SANDBOX_SUPERVISOR_TOKEN)))
      )
        throw new Error("SANDBOX_SUPERVISOR_TOKEN must be dedicated");
    }
    if ([env.AUTH_SECRET, env.APP_KEY].includes(env.SANDBOX_SUPERVISOR_TOKEN))
      throw new Error("SANDBOX_SUPERVISOR_TOKEN must be dedicated");
  }
  if (env.SERVER_ROLE === "api" && !env.REDIS_URL)
    throw new Error("The api role requires REDIS_URL; use both for a single backend");
  if (env.NODE_ENV === "production") {
    if (
      !runtimeEnv.DATABASE_URL ||
      !runtimeEnv.AUTH_URL ||
      !runtimeEnv.AUTH_SECRET ||
      !runtimeEnv.APP_KEY ||
      !runtimeEnv.ALLOWED_ORIGINS
    )
      throw new Error(
        "Production requires DATABASE_URL, AUTH_URL, AUTH_SECRET, APP_KEY and ALLOWED_ORIGINS",
      );
    if (env.AUTH_SECRET.startsWith("raypx-development"))
      throw new Error("Production AUTH_SECRET must be explicitly configured");
    if (env.APP_KEY.startsWith("raypx-development"))
      throw new Error("Production APP_KEY must be explicitly configured");
    // Rotating sessions must never invalidate stored credentials or enrolled instances.
    if (env.APP_KEY === env.AUTH_SECRET)
      throw new Error("Production APP_KEY must differ from AUTH_SECRET");
    if (new URL(env.AUTH_URL).protocol !== "https:")
      throw new Error("Production AUTH_URL must use HTTPS");
  }
  for (const provider of ["GOOGLE", "GITHUB"] as const) {
    if (Boolean(env[`${provider}_CLIENT_ID`]) !== Boolean(env[`${provider}_CLIENT_SECRET`]))
      throw new Error(
        `${provider} login requires both ${provider}_CLIENT_ID and ${provider}_CLIENT_SECRET`,
      );
  }
  if (Boolean(env.AUTH_TURNSTILE_SITE_KEY) !== Boolean(env.AUTH_TURNSTILE_SECRET_KEY))
    throw new Error(
      "Turnstile requires both AUTH_TURNSTILE_SITE_KEY and AUTH_TURNSTILE_SECRET_KEY",
    );
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
