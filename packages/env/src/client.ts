import { z } from "zod";

// No public configuration is currently supported. Future fields must be declared
// here explicitly and populated from public build inputs, never from server env.
const clientEnvSchema = z.object({});

/** Public browser configuration inferred from the explicit public schema. */
export type ClientEnv = Readonly<z.infer<typeof clientEnvSchema>>;

/**
 * Parses only explicitly declared public fields, stripping all other inputs.
 * No server credentials or process environment values are read by this module.
 */
export function parseClientEnv(input: Record<string, unknown>): ClientEnv {
  return Object.freeze(clientEnvSchema.parse(input));
}

const clientEnv = parseClientEnv({});

/** Returns the frozen public configuration; no public fields exist yet. */
export function getClientEnv(): ClientEnv {
  return clientEnv;
}
