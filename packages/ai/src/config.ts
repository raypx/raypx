import { AiError } from "./errors.js";

export interface AiSettings {
  provider?: string;
  model?: string;
  base_url?: string;
  api?: "anthropic-messages" | "openai-completions" | "openai-responses";
  api_key_env?: string;
  auth?: "api_key" | "bearer";
  context_window?: number;
  max_tokens?: number;
  timeout_ms?: number;
  temperature?: number;
}
function endpoint(value: string | undefined) {
  if (value === undefined) return value;
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch {
    return value;
  }
}
/** A destination change must not borrow another provider's identity or credentials. */
export function mergeAiSettings(file: AiSettings, override: AiSettings): AiSettings {
  const inherited = { ...file };
  if (override.provider !== undefined && override.provider !== file.provider) {
    for (const field of [
      "model",
      "base_url",
      "api",
      "api_key_env",
      "auth",
      "context_window",
      "max_tokens",
    ] as const)
      delete inherited[field];
  } else if (
    override.base_url !== undefined &&
    endpoint(override.base_url) !== endpoint(file.base_url)
  ) {
    for (const field of ["api_key_env", "auth", "context_window", "max_tokens"] as const)
      delete inherited[field];
  }
  return parseAiSettings({ ...inherited, ...override });
}
const fields = new Set([
  "provider",
  "model",
  "base_url",
  "api",
  "api_key_env",
  "auth",
  "context_window",
  "max_tokens",
  "timeout_ms",
  "temperature",
]);
export function parseAiSettings(value: unknown): AiSettings {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date)
    throw new AiError("AI_INVALID_CONFIG");
  const table = value as Record<string, unknown>;
  if (Object.keys(table).some((key) => !fields.has(key))) throw new AiError("AI_INVALID_CONFIG");
  for (const key of ["provider", "model", "base_url", "api", "api_key_env"])
    if (
      table[key] !== undefined &&
      (typeof table[key] !== "string" || !table[key].trim() || table[key].length > 2048)
    )
      throw new AiError("AI_INVALID_CONFIG");
  if (
    table.provider !== undefined &&
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(table.provider as string)
  )
    throw new AiError("AI_INVALID_CONFIG");
  if (
    table.api !== undefined &&
    !["anthropic-messages", "openai-completions", "openai-responses"].includes(table.api as string)
  )
    throw new AiError("AI_INVALID_CONFIG");
  if (
    table.api_key_env !== undefined &&
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.api_key_env as string)
  )
    throw new AiError("AI_INVALID_CONFIG");
  if (table.auth !== undefined && !["api_key", "bearer"].includes(table.auth as string))
    throw new AiError("AI_INVALID_CONFIG");
  for (const [key, maximum] of [
    ["context_window", 10_000_000],
    ["max_tokens", 1_000_000],
    ["timeout_ms", 900_000],
  ] as const) {
    const n = table[key];
    if (
      n !== undefined &&
      (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > maximum)
    )
      throw new AiError("AI_INVALID_CONFIG");
  }
  if (
    table.temperature !== undefined &&
    (typeof table.temperature !== "number" ||
      !Number.isFinite(table.temperature) ||
      table.temperature < 0 ||
      table.temperature > 2)
  )
    throw new AiError("AI_INVALID_CONFIG");
  if (
    table.max_tokens !== undefined &&
    table.context_window !== undefined &&
    (table.max_tokens as number) > (table.context_window as number)
  )
    throw new AiError("AI_INVALID_CONFIG");
  return { ...table };
}
