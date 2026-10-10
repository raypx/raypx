import { isIP } from "node:net";
import { z } from "zod";

function blankToUndefined(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isListenHost(value: string): boolean {
  if (isIP(value)) return true;
  // A dotted decimal address must be a valid IPv4 address, not a hostname.
  if (/^[\d.]+$/.test(value)) return false;
  const hostname = value.endsWith(".") ? value.slice(0, -1) : value;
  return (
    hostname.length <= 253 &&
    hostname.split(".").every((label) => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label))
  );
}

const optionalBoolean = z.preprocess((value) => {
  const normalized = blankToUndefined(value);
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return normalized;
}, z.boolean().optional());
const optionalPositiveInteger = z.preprocess((value) => {
  const normalized = blankToUndefined(value);
  return typeof normalized === "string" && /^\d+$/.test(normalized)
    ? Number(normalized)
    : normalized;
}, z.number().int().min(1).max(1_000_000).optional());
function defaultPositiveInteger(max: number, defaultValue: number) {
  return z.preprocess((value) => {
    const normalized = blankToUndefined(value);
    return typeof normalized === "string" && /^\d+$/.test(normalized)
      ? Number(normalized)
      : normalized;
  }, z.number().int().min(1).max(max).default(defaultValue));
}
const optionalOrigin = z.preprocess(
  blankToUndefined,
  z
    .string()
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    })
    .transform((value) => new URL(value).origin)
    .optional(),
);

const serverEnvSchema = z
  .object({
    NODE_ENV: z.preprocess(
      blankToUndefined,
      z.enum(["development", "test", "production"]).default("development"),
    ),
    HOST: z.preprocess(blankToUndefined, z.string().refine(isListenHost).default("127.0.0.1")),
    PORT: z.preprocess((value) => {
      const normalized = blankToUndefined(value);
      return typeof normalized === "string" && /^\d+$/.test(normalized)
        ? Number(normalized)
        : normalized;
    }, z.number().int().min(1).max(65535).default(3000)),
    LOG_LEVEL: z.preprocess(
      blankToUndefined,
      z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),
    ),
    APP_VERSION: z.preprocess(blankToUndefined, z.string().min(1).max(128).optional()),
    APP_ORIGIN: optionalOrigin,
    AUTH_ENABLED: optionalBoolean,
    DATABASE_PATH: z.preprocess(
      blankToUndefined,
      z
        .string()
        .min(1)
        .max(1024)
        .refine((value) => !value.includes("\0"))
        .optional(),
    ),
    BETTER_AUTH_URL: optionalOrigin,
    BETTER_AUTH_SECRET: z.preprocess(blankToUndefined, z.string().min(32).max(1024).optional()),
    METRICS_ENABLED: optionalBoolean,
    METRICS_TOKEN: z.preprocess(
      blankToUndefined,
      z
        .string()
        .regex(/^[A-Za-z0-9_-]{32,1024}$/)
        .optional(),
    ),
    API_RATE_LIMIT_MAX: optionalPositiveInteger,
    API_RATE_LIMIT_WINDOW_MS: optionalPositiveInteger,
    API_BODY_MAX_BYTES: defaultPositiveInteger(67_108_864, 1_048_576),
    API_BODY_TIMEOUT_MS: defaultPositiveInteger(120_000, 10_000),
  })
  .superRefine((env, context) => {
    if (env.AUTH_ENABLED) {
      if (!env.BETTER_AUTH_SECRET)
        context.addIssue({ code: "custom", path: ["BETTER_AUTH_SECRET"], message: "Required" });
      if (
        !env.BETTER_AUTH_URL ||
        (env.NODE_ENV === "production" && !env.BETTER_AUTH_URL.startsWith("https://"))
      )
        context.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_URL"],
          message: "Required secure origin",
        });
    }
    if (env.METRICS_ENABLED && !env.METRICS_TOKEN)
      context.addIssue({ code: "custom", path: ["METRICS_TOKEN"], message: "Required" });
  });

/** Validated server configuration, with types inferred from the runtime schema. */
export type ServerEnv = Readonly<z.infer<typeof serverEnvSchema>>;

export type EnvironmentField = keyof ServerEnv | "NITRO_HOST" | "NITRO_PORT";

export interface EnvironmentIssue {
  field: EnvironmentField;
  message: string;
}

const fieldRules: Record<EnvironmentField, string> = {
  NODE_ENV: "must be development, test, or production",
  HOST: "must be an IPv4 address, IPv6 address, or hostname without a scheme or port",
  PORT: "must be an integer between 1 and 65535",
  NITRO_HOST: "must be an IPv4 address, IPv6 address, or hostname without a scheme or port",
  NITRO_PORT: "must be an integer between 1 and 65535",
  LOG_LEVEL: "must be trace, debug, info, warn, error, fatal, or silent",
  APP_VERSION: "must be a string of at most 128 characters",
  APP_ORIGIN: "must be an HTTP(S) origin without credentials, a path, query, or fragment",
  AUTH_ENABLED: "must be true or false",
  DATABASE_PATH: "must be a nonempty path of at most 1024 characters without null bytes",
  BETTER_AUTH_URL:
    "must be an HTTP(S) origin; required when authentication is enabled, with HTTPS in production",
  BETTER_AUTH_SECRET: "must contain 32 to 1024 characters; required when authentication is enabled",
  METRICS_ENABLED: "must be true or false",
  METRICS_TOKEN:
    "must contain 32 to 1024 letters, digits, hyphens, or underscores; required when metrics are enabled",
  API_RATE_LIMIT_MAX: "must be an integer between 1 and 1000000",
  API_RATE_LIMIT_WINDOW_MS: "must be an integer between 1 and 1000000 milliseconds",
  API_BODY_MAX_BYTES: "must be an integer between 1 and 67108864 bytes",
  API_BODY_TIMEOUT_MS: "must be an integer between 1 and 120000 milliseconds",
};

/** A configuration error containing field names and rules, never supplied values. */
export class ServerEnvironmentError extends Error {
  readonly issues: readonly Readonly<EnvironmentIssue>[];

  constructor(fields: readonly EnvironmentField[]) {
    const issues = fields.map((field) => Object.freeze({ field, message: fieldRules[field] }));
    super(
      `Invalid server environment:\n${issues.map(({ field, message }) => `- ${field}: ${message}`).join("\n")}`,
    );
    this.name = "ServerEnvironmentError";
    this.issues = Object.freeze(issues);
  }
}

/**
 * Parses supplied configuration without reading the process environment.
 * Empty or whitespace-only strings use defaults or omit optional fields.
 * Nonblank NITRO_HOST and NITRO_PORT override HOST and PORT respectively.
 * Unknown fields are stripped, and error messages never include their values.
 *
 * @param input - Configuration values to validate
 * @returns Frozen, validated server configuration
 * @throws {ServerEnvironmentError} If a supported field is invalid
 */
export function parseServerEnv(input: Record<string, unknown>): ServerEnv {
  const nitroHost = blankToUndefined(input.NITRO_HOST);
  const nitroPort = blankToUndefined(input.NITRO_PORT);
  const hostField = nitroHost === undefined ? "HOST" : "NITRO_HOST";
  const portField = nitroPort === undefined ? "PORT" : "NITRO_PORT";
  const result = serverEnvSchema.safeParse({
    ...input,
    NODE_ENV: input.NODE_ENV,
    HOST: nitroHost === undefined ? input.HOST : nitroHost,
    PORT: nitroPort === undefined ? input.PORT : nitroPort,
    LOG_LEVEL: input.LOG_LEVEL,
    APP_VERSION: input.APP_VERSION,
  });
  if (result.success) return Object.freeze(result.data);
  const fields = new Set<EnvironmentField>();
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && Object.hasOwn(fieldRules, field)) {
      fields.add(
        field === "HOST" ? hostField : field === "PORT" ? portField : (field as EnvironmentField),
      );
    }
  }
  throw new ServerEnvironmentError([...fields]);
}

let serverEnv: ServerEnv | undefined;

/**
 * Validates and stores configuration explicitly, for application startup.
 * Importing this module never reads environment variables or validates them.
 *
 * @param input - Supplied configuration; defaults to the current process environment
 * @returns Frozen configuration shared by subsequent getServerEnv calls
 * @throws {ServerEnvironmentError} If a supported field is invalid
 */
export function loadServerEnv(input: Record<string, unknown> = process.env): ServerEnv {
  const parsed = parseServerEnv(input);
  serverEnv = parsed;
  return parsed;
}

/**
 * Returns the stored configuration, reading and validating it on first use.
 * Applications should call loadServerEnv before accepting requests.
 */
export function getServerEnv(): ServerEnv {
  return serverEnv ?? loadServerEnv();
}
