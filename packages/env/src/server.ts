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

const serverEnvSchema = z.object({
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
