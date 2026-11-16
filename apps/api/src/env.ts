import { derivePublicAddress, rejectRetiredOriginInputs } from "./public-address.js";
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
  PUBLIC_URL: z.string().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().optional(),
  EXTRA_ALLOWED_ORIGINS: z.string().default(""),
  COMPUTERS_PER_MEMBER: computerLimit("10"),
  COMPUTERS_PER_SPACE: computerLimit("1"),
  SERVER_ROLE: z.enum(["api", "all"]).default("all"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AGENT_MODELS: z.string().default("[]"),
  AGENT_MODEL_CREDENTIALS: z.string().default("{}"),
  APPROVAL_REVIEW_MODEL_ID: z.string().trim().min(1).max(200).optional(),
  APPROVAL_DEFAULT_MODE: z.enum(["ask", "never", "auto"]).default("ask"),
  APPROVAL_REQUEST_TTL_MS: z.coerce.number().int().min(1).max(86_400_000).default(600_000),
  RUN_RECOVERY_INTERVAL_MS: z.coerce.number().int().min(10).max(60_000).default(5_000),
  RUN_LEASE_MS: z.coerce.number().int().min(100).max(300_000).default(15_000),
  RUN_HEARTBEAT_MS: z.coerce.number().int().min(10).max(60_000).default(5_000),
  RUN_ATTEMPT_TIMEOUT_MS: z.coerce.number().int().min(100).max(86_400_000).default(300_000),
  RUN_BACKUP_MARGIN_MS: z.coerce.number().int().min(1).max(300_000).default(30_000),
  ROUTINE_EMAIL_RELAY_TOKEN: z
    .string()
    .min(32)
    .max(512)
    .regex(/^[^\r\n]+$/)
    .optional(),
  ROUTINE_EMAIL_DOMAIN: z
    .string()
    .max(253)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/)
    .optional(),
  SETUP_TOKEN: z
    .string()
    .min(32)
    .max(512)
    .regex(/^[!-~]+$/)
    .optional(),
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
  AUTH_SECRET: z.string().min(32).default("raypx-development-only-secret-32-characters"),
  /** Encrypts stored provider credentials; never the auth secret. */
  APP_KEY: z.string().min(32).default("raypx-development-only-app-key-32-characters"),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
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
  rejectRetiredOriginInputs(runtimeEnv);
  const env = defineEnv({ extends: [apiServerEnv], runtimeEnv, isServer: true });
  const address = derivePublicAddress(env, runtimeEnv);
  validateRunTiming(env);
  if (Boolean(env.ROUTINE_EMAIL_RELAY_TOKEN) !== Boolean(env.ROUTINE_EMAIL_DOMAIN))
    throw new Error("Routine email requires ROUTINE_EMAIL_RELAY_TOKEN and ROUTINE_EMAIL_DOMAIN");
  if (env.ROUTINE_EMAIL_RELAY_TOKEN) {
    const token = env.ROUTINE_EMAIL_RELAY_TOKEN;
    for (const [key, value] of Object.entries(runtimeEnv)) {
      if (
        key !== "ROUTINE_EMAIL_RELAY_TOKEN" &&
        value &&
        (value === token || value.includes(JSON.stringify(token)))
      )
        throw new Error("ROUTINE_EMAIL_RELAY_TOKEN must be dedicated");
    }
    if ([env.AUTH_SECRET, env.APP_KEY].includes(token))
      throw new Error("ROUTINE_EMAIL_RELAY_TOKEN must be dedicated");
  }
  if (env.NODE_ENV === "production") {
    if (!runtimeEnv.DATABASE_URL || !runtimeEnv.AUTH_SECRET || !runtimeEnv.APP_KEY)
      throw new Error("Production requires DATABASE_URL, PUBLIC_URL, AUTH_SECRET and APP_KEY");
    if (env.AUTH_SECRET.startsWith("raypx-development"))
      throw new Error("Production AUTH_SECRET must be explicitly configured");
    if (env.APP_KEY.startsWith("raypx-development"))
      throw new Error("Production APP_KEY must be explicitly configured");
    // Rotating sessions must never invalidate stored credentials.
    if (env.APP_KEY === env.AUTH_SECRET)
      throw new Error("Production APP_KEY must differ from AUTH_SECRET");
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
    ...address,
    ipAddressHeaders: list(env.AUTH_IP_HEADERS).map((v) => v.toLowerCase()),
    trustedProxies: list(env.AUTH_TRUSTED_PROXIES),
  };
}
export type ApiEnvironment = ReturnType<typeof getApiEnvironment>;

export function getServerRole(runtimeEnv: Record<string, string | undefined> = process.env) {
  rejectRetiredOriginInputs(runtimeEnv);
  return z.enum(["api", "worker", "relay", "all"]).parse(runtimeEnv.SERVER_ROLE || "all");
}

function validateRunTiming(environment: { RUN_HEARTBEAT_MS: number; RUN_LEASE_MS: number }) {
  if (environment.RUN_HEARTBEAT_MS * 2 > environment.RUN_LEASE_MS)
    throw new Error("RUN_LEASE_MS must allow at least two heartbeats");
}

/** Worker Runs need no broker; split device computers optionally reuse one. */
export function getWorkerEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  rejectRetiredOriginInputs(runtimeEnv);
  const environment = defineEnv({
    isServer: true,
    runtimeEnv,
    server: {
      NODE_ENV: server.NODE_ENV,
      PUBLIC_URL: server.PUBLIC_URL,
      API_PUBLIC_URL: server.API_PUBLIC_URL,
      EXTRA_ALLOWED_ORIGINS: server.EXTRA_ALLOWED_ORIGINS,
      DATABASE_URL: server.DATABASE_URL,
      DATABASE_MIGRATE_ON_START: server.DATABASE_MIGRATE_ON_START,
      COMPUTERS_PER_MEMBER: server.COMPUTERS_PER_MEMBER,
      COMPUTERS_PER_SPACE: server.COMPUTERS_PER_SPACE,
      AGENT_MODELS: server.AGENT_MODELS,
      AGENT_MODEL_CREDENTIALS: server.AGENT_MODEL_CREDENTIALS,
      APPROVAL_REVIEW_MODEL_ID: server.APPROVAL_REVIEW_MODEL_ID,
      APP_KEY: server.APP_KEY,
      APPROVAL_DEFAULT_MODE: server.APPROVAL_DEFAULT_MODE,
      APPROVAL_REQUEST_TTL_MS: server.APPROVAL_REQUEST_TTL_MS,
      RUN_RECOVERY_INTERVAL_MS: server.RUN_RECOVERY_INTERVAL_MS,
      RUN_LEASE_MS: server.RUN_LEASE_MS,
      RUN_HEARTBEAT_MS: server.RUN_HEARTBEAT_MS,
      RUN_ATTEMPT_TIMEOUT_MS: server.RUN_ATTEMPT_TIMEOUT_MS,
      RUN_BACKUP_MARGIN_MS: server.RUN_BACKUP_MARGIN_MS,
      ROUTINE_EMAIL_DOMAIN: server.ROUTINE_EMAIL_DOMAIN,
      REDIS_URL: server.REDIS_URL,
    },
  });
  validateRunTiming(environment);
  if (environment.NODE_ENV === "production" && !runtimeEnv.DATABASE_URL)
    throw new Error("Production worker requires DATABASE_URL");
  if (
    environment.NODE_ENV === "production" &&
    (!runtimeEnv.APP_KEY || environment.APP_KEY.startsWith("raypx-development"))
  )
    throw new Error("Production worker requires APP_KEY");
  if (!/^postgres(?:ql)?:$/.test(new URL(environment.DATABASE_URL).protocol))
    throw new Error("Invalid worker database protocol");
  const { REDIS_URL, ...worker } = environment;
  return {
    ...worker,
    ...derivePublicAddress(environment, runtimeEnv),
    ...(REDIS_URL ? { REDIS_URL } : {}),
  };
}
export type WorkerEnvironment = ReturnType<typeof getWorkerEnvironment>;

/** Relay intentionally never parses authentication, mail or signing configuration. */
export function getRelayEnvironment(runtimeEnv: Record<string, string | undefined> = process.env) {
  rejectRetiredOriginInputs(runtimeEnv);
  const env = defineEnv({
    isServer: true,
    runtimeEnv,
    server: {
      NODE_ENV: server.NODE_ENV,
      PUBLIC_URL: server.PUBLIC_URL,
      API_PUBLIC_URL: server.API_PUBLIC_URL,
      EXTRA_ALLOWED_ORIGINS: server.EXTRA_ALLOWED_ORIGINS,
      DATABASE_URL: z.url(),
      REDIS_URL: z.url().optional(),
    },
  });
  if (!/^postgres(?:ql)?:$/.test(new URL(env.DATABASE_URL).protocol))
    throw new Error("Invalid Relay database protocol");
  if (env.REDIS_URL && !/^rediss?:$/.test(new URL(env.REDIS_URL).protocol))
    throw new Error("Invalid Relay broker protocol");
  return { ...env, ...derivePublicAddress(env, runtimeEnv) };
}
export type RelayEnvironment = ReturnType<typeof getRelayEnvironment>;
