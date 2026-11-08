import type { DrainContext } from "evlog";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** A drained event after the policy: the fixed envelope plus allowed, cleaned fields. */
export type SafeEvent = Readonly<Record<string, JsonValue>> & {
  readonly timestamp: string;
  readonly level: string;
  readonly service: string;
  readonly environment: string;
};

export type SafeDrain = (context: { event: SafeEvent }) => void | Promise<void>;

export interface EventPolicyOptions {
  /** Top-level fields that may leave the process. Everything else is dropped. */
  fields: readonly string[];
  /**
   * Allowed fields that keep only the listed string properties, for framework
   * objects such as `{ rpc: ["system", "method"] }`.
   */
  shapes?: Readonly<Record<string, readonly string[]>>;
  /** Upper bound for one serialized event in UTF-8 bytes (default 16 KiB). */
  maxEventBytes?: number;
  /**
   * Field names whose values are always replaced, at any depth. Names are compared
   * after removing non-alphanumerics and lowercasing. Defaults to
   * {@link DEFAULT_SENSITIVE_KEYS}.
   */
  sensitiveKeys?: RegExp;
}

const REDACTED = "[REDACTED]";
const ENVELOPE = ["timestamp", "level", "service", "environment"] as const;
const LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal"]);
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype", "toJSON"]);
const ERROR_NAMES = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
  "AggregateError",
  "AbortError",
  "TimeoutError",
]);

/** Credentials, personal data, request material, process output and free text. */
export const DEFAULT_SENSITIVE_KEYS =
  /^(path|input|text)$|password|passwd|secret|token|authorization|cookie|credential|apikey|privatekey|email|username|headers|payload|body|content|output|stdout|stderr|stack|cause|message|filename|filepath|directory|command|argv|args|cwd|query|url|uri/;

/** Reads data properties only; the policy never invokes getters or toJSON. */
function ownData(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
}

function cleanString(value: string): string {
  return (
    value
      .slice(0, 256)
      .replace(/https?:\/\/[^\s]+/gi, REDACTED)
      .replace(/\bBearer\s+[^\s,;]+/gi, REDACTED)
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED)
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
      .replace(/\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, REDACTED)
      // oxlint-disable-next-line no-control-regex -- Control characters never reach log output.
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 256)
  );
}

/**
 * Reduces any error, including evlog's serialized error field, to a standard name and
 * an optional machine code. Messages, causes and stacks are never kept.
 */
export function safeError(error: unknown): { name: string; code?: string | number } {
  try {
    let name = ownData(error, "name");
    if (name === undefined && error instanceof Error) {
      if (error instanceof TypeError) name = "TypeError";
      else if (error instanceof RangeError) name = "RangeError";
      else if (error instanceof SyntaxError) name = "SyntaxError";
      else if (error instanceof ReferenceError) name = "ReferenceError";
    }
    const result: { name: string; code?: string | number } = {
      name: typeof name === "string" && ERROR_NAMES.has(name) ? name : "Error",
    };
    const code = ownData(error, "code");
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code)) result.code = code;
    else if (typeof code === "number" && Number.isSafeInteger(code)) result.code = code;
    return result;
  } catch {
    return { name: "Error" };
  }
}

/**
 * Returns a function that projects a raw event to its safe form: the envelope, then
 * allowed fields in order until the byte limit. Hostile values cannot throw out of it.
 */
export function createEventPolicy({
  fields,
  shapes = {},
  maxEventBytes = 16_384,
  sensitiveKeys = DEFAULT_SENSITIVE_KEYS,
}: EventPolicyOptions): (event: unknown) => SafeEvent {
  const sensitive = (key: string) =>
    sensitiveKeys.test(key.replace(/[^a-z0-9]/gi, "").toLowerCase());
  const allowed = [...new Set(fields)].filter(
    (key) =>
      key.length <= 64 &&
      !FORBIDDEN_KEYS.has(key) &&
      !(ENVELOPE as readonly string[]).includes(key),
  );
  const encoder = new TextEncoder();

  function clean(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
    budget: { remaining: number },
  ): JsonValue | undefined {
    if (budget.remaining-- <= 0) return "[SIZE_LIMIT]";
    try {
      if (value === null || typeof value === "boolean") return value;
      if (typeof value === "string") return cleanString(value);
      if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
      if (typeof value !== "object") return undefined;
      if (value instanceof Error) return safeError(value);
      if (depth >= 4) return "[DEPTH_LIMIT]";
      if (seen.has(value)) return "[CIRCULAR]";
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          const result: JsonValue[] = [];
          const length = ownData(value, "length");
          const count = Math.min(typeof length === "number" ? length : 0, 16);
          for (let index = 0; index < count && budget.remaining > 0; index++) {
            const item = clean(ownData(value, String(index)), depth + 1, seen, budget);
            if (item !== undefined) result.push(item);
          }
          return result;
        }
        const result: Record<string, JsonValue> = {};
        for (const key of Object.keys(value).slice(0, 32)) {
          if (budget.remaining <= 0) break;
          if (key.length > 64 || FORBIDDEN_KEYS.has(key)) continue;
          if (sensitive(key)) {
            result[key] = REDACTED;
            continue;
          }
          const child = clean(ownData(value, key), depth + 1, seen, budget);
          if (child !== undefined) result[key] = child;
        }
        return result;
      } catch {
        return "[UNAVAILABLE]";
      } finally {
        seen.delete(value);
      }
    } catch {
      return "[UNAVAILABLE]";
    }
  }

  return (event) => {
    const text = (key: string, fallback: string) => {
      const value = ownData(event, key);
      return typeof value === "string" ? cleanString(value).slice(0, 80) : fallback;
    };
    const level = ownData(event, "level");
    const result: Record<string, JsonValue> = {
      timestamp: text("timestamp", new Date().toISOString()),
      level: typeof level === "string" && LEVELS.has(level) ? level : "info",
      service: text("service", "unknown"),
      environment: text("environment", "unknown"),
    };
    let bytes = encoder.encode(JSON.stringify(result)).byteLength;
    const budget = { remaining: 256 };
    for (const key of allowed) {
      if (budget.remaining <= 0) break;
      budget.remaining -= 1;
      const value = ownData(event, key);
      if (value === undefined) continue;
      let projected: JsonValue | undefined;
      if (sensitive(key)) projected = REDACTED;
      else if (key === "error") projected = safeError(value);
      else if (Object.hasOwn(shapes, key)) {
        const shaped: Record<string, JsonValue> = {};
        for (const field of shapes[key] ?? []) {
          const entry = ownData(value, field);
          if (typeof entry === "string" && !sensitive(field)) shaped[field] = cleanString(entry);
        }
        projected = shaped;
      } else projected = clean(value, 0, new WeakSet(), budget);
      if (projected === undefined) continue;
      const size = encoder.encode(JSON.stringify({ [key]: projected })).byteLength;
      if (bytes + size > maxEventBytes) continue;
      result[key] = projected;
      bytes += size;
    }
    return Object.freeze(result) as SafeEvent;
  };
}

/**
 * Wraps a drain so it only ever receives policy-projected events. Request metadata
 * and headers from the drain context are never forwarded. A failing projection
 * drops the event instead of interrupting the caller.
 */
export function withEventPolicy(
  drain: SafeDrain,
  options: EventPolicyOptions,
): (context: DrainContext) => void | Promise<void> {
  const project = createEventPolicy(options);
  return (context) => {
    let event: SafeEvent;
    try {
      event = project(ownData(context, "event"));
    } catch {
      return;
    }
    return drain({ event });
  };
}
