import { type ConsolaInstance, consola } from "consola";
import pino, { type Logger as PinoLogger } from "pino";

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LoggerOptions {
  name?: string;
  level?: LogLevel;
  /** Force a specific logger type, otherwise auto-detect based on NODE_ENV */
  forceType?: "pino" | "consola";
}

interface Logger {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  fatal: (message: string, ...args: unknown[]) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}

const isDev = process.env.NODE_ENV !== "production";

function createConsolaLogger(options: LoggerOptions = {}): Logger {
  const instance: ConsolaInstance = options.name ? consola.withTag(options.name) : consola;

  if (options.level) {
    instance.level = getConsolaLevel(options.level);
  }

  return {
    debug: (message, ...args) => instance.debug(message, ...args),
    info: (message, ...args) => instance.info(message, ...args),
    warn: (message, ...args) => instance.warn(message, ...args),
    error: (message, ...args) => instance.error(message, ...args),
    fatal: (message, ...args) => instance.fatal(message, ...args),
    child: (bindings) =>
      createConsolaLogger({
        ...options,
        name: bindings.name?.toString() ?? options.name,
      }),
  };
}

function createPinoLogger(options: LoggerOptions = {}): Logger {
  const instance: PinoLogger = pino({
    name: options.name,
    level: options.level ?? "info",
  });

  return {
    debug: (message, ...args) => instance.debug({ args }, message),
    info: (message, ...args) => instance.info({ args }, message),
    warn: (message, ...args) => instance.warn({ args }, message),
    error: (message, ...args) => instance.error({ args }, message),
    fatal: (message, ...args) => instance.fatal({ args }, message),
    child: (bindings) => {
      const childPino = instance.child(bindings);
      return {
        debug: (message, ...args) => childPino.debug({ args }, message),
        info: (message, ...args) => childPino.info({ args }, message),
        warn: (message, ...args) => childPino.warn({ args }, message),
        error: (message, ...args) => childPino.error({ args }, message),
        fatal: (message, ...args) => childPino.fatal({ args }, message),
        child: (b) => createPinoLogger({ ...options, name: b.name?.toString() }),
      };
    },
  };
}

function getConsolaLevel(level: LogLevel): number {
  const levels: Record<LogLevel, number> = {
    fatal: 0,
    error: 0,
    warn: 1,
    info: 3,
    debug: 4,
  };
  return levels[level];
}

/**
 * Create a logger instance
 * - Development: Uses Consola (pretty output)
 * - Production: Uses Pino (JSON output)
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const useConsola = options.forceType ? options.forceType === "consola" : isDev;

  return useConsola ? createConsolaLogger(options) : createPinoLogger(options);
}

/** Default logger instance */
export const logger = createLogger();

export type { Logger, LoggerOptions, LogLevel };
