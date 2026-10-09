import { AsyncLocalStorage } from "node:async_hooks";
import { initLogger, log as evlog, type LogLevel as EvlogLevel } from "evlog";

export type LogLevel = EvlogLevel | "silent";
export type LogFields = Record<string, unknown>;
export interface LogRecord extends LogFields {
  timestamp: string;
  level: EvlogLevel;
  service: string;
  message: string;
}
export interface LoggerOptions {
  name?: string;
  level?: LogLevel | number;
  fields?: LogFields;
  sink?: (record: LogRecord) => void;
}
export interface LoggingOptions {
  level?: LogLevel;
  environment?: "development" | "test" | "production";
  version?: string;
  pretty?: boolean;
}
export interface LogMethod {
  (message: string, fields?: LogFields): void;
  (fields: LogFields, message?: string): void;
}
export interface Logger {
  trace: LogMethod;
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
  fatal: LogMethod;
  child(fields: LogFields): Logger;
}

const levels = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
interface LoggingState {
  context: AsyncLocalStorage<LogFields>;
  minimumLevel: LogLevel;
  environment: string;
  version?: string;
}
// The application and its SSR bundle must share configuration and correlation.
const loggingStateKey = Symbol.for("@raypx/logger/state/v1");
const shared = globalThis as typeof globalThis & { [loggingStateKey]?: LoggingState };
const state = (shared[loggingStateKey] ??= {
  context: new AsyncLocalStorage<LogFields>(),
  minimumLevel: "debug",
  environment: "development",
});
const sensitiveKey =
  /password|passwd|secret|token|authorization|cookie|apikey|connectionstring|databaseurl|redisurl|dsn/i;

function sanitizeText(value: string): string {
  return value
    .replace(/([a-z][a-z\d+.-]*:\/\/)[^\s/@]+@/gi, "$1[REDACTED]@")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|passwd|secret|token|api[_-]?key)(\s*[=:]\s*)[^\s&,;]+/gi,
      "$1$2[REDACTED]",
    );
}

/** Serializes errors and redacts credentials before any log reaches its sink. */
export function redact(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (depth > 10) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeText(value.message),
      stack: value.stack ? sanitizeText(value.stack) : undefined,
      cause: value.cause === undefined ? undefined : redact(value.cause, seen, depth + 1),
    };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen, depth + 1));
  const entries = value instanceof Headers ? [...value.entries()] : Object.entries(value);
  return Object.fromEntries(
    entries.map(([key, item]) => [
      key,
      sensitiveKey.test(key.replace(/[_-]/g, "")) ? "[REDACTED]" : redact(item, seen, depth + 1),
    ]),
  );
}

/** Configures the supported evlog API once during application initialization. */
export function configureLogging(options: LoggingOptions = {}): void {
  state.minimumLevel = options.level ?? (options.environment === "production" ? "info" : "debug");
  state.environment = options.environment ?? "development";
  state.version = options.version;
  initLogger({
    env: { service: "raypx", environment: state.environment, version: state.version },
    pretty: options.pretty ?? state.environment === "development",
    minLevel: state.minimumLevel === "silent" ? "fatal" : state.minimumLevel,
    enabled: state.minimumLevel !== "silent",
    stringify: true,
    // All fields are sanitized before entering evlog, including development output.
    redact: false,
  });
}

/** Carries correlation fields through concurrent asynchronous operations. */
export function withLogContext<T>(fields: LogFields, operation: () => T): T {
  return state.context.run({ ...state.context.getStore(), ...fields }, operation);
}

/** Creates an independent logger; it does not initialize database or authentication. */
export function createLogger(options: LoggerOptions = {}): Logger {
  function method(level: EvlogLevel): LogMethod {
    return (messageOrFields: string | LogFields, fieldsOrMessage?: LogFields | string) => {
      const threshold =
        typeof options.level === "number"
          ? (levels[options.level] ?? state.minimumLevel)
          : (options.level ?? state.minimumLevel);
      if (levels.indexOf(level) < levels.indexOf(threshold)) return;
      const message =
        typeof messageOrFields === "string"
          ? messageOrFields
          : typeof fieldsOrMessage === "string"
            ? fieldsOrMessage
            : "";
      const fields =
        typeof messageOrFields === "string"
          ? typeof fieldsOrMessage === "object"
            ? fieldsOrMessage
            : {}
          : messageOrFields;
      try {
        const safeFields = redact({
          ...options.fields,
          ...state.context.getStore(),
          ...fields,
        }) as LogFields;
        const record: LogRecord = {
          ...safeFields,
          timestamp: new Date().toISOString(),
          environment: state.environment,
          ...(state.version ? { version: state.version } : {}),
          level,
          service: options.name ?? "raypx",
          message: sanitizeText(message),
        };
        if (options.sink) options.sink(record);
        else evlog[level](record);
      } catch {
        // Serialization and sink failures must not change the business outcome.
      }
    };
  }
  return {
    trace: method("trace"),
    debug: method("debug"),
    info: method("info"),
    warn: method("warn"),
    error: method("error"),
    fatal: method("fatal"),
    child: (fields) => createLogger({ ...options, fields: { ...options.fields, ...fields } }),
  };
}

export const logger = createLogger();
export { evlog };
export default logger;
