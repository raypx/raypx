import { type ConsolaInstance, createConsola } from "consola";

/**
 * Consola log levels:
 * 0: silent (no output)
 * 1: error (only errors)
 * 2: warn (errors + warnings)
 * 3: info (errors + warnings + info)
 * 4: debug (errors + warnings + info + debug)
 */

/**
 * Internal logger instance
 * Can be replaced via setLogger() for testing or custom configurations
 */
let _logger: ConsolaInstance = createConsola({
  level: process.env.NODE_ENV === "production" ? 3 : 4,
  formatOptions: {
    colors: true,
    date: true,
    compact: false,
  },
});

/**
 * Get the current logger instance
 */
export function getLogger(): ConsolaInstance {
  return _logger;
}

/**
 * Replace the logger instance
 * Useful for testing or providing custom logger configurations
 */
export function setLogger(newLogger: ConsolaInstance): void {
  _logger = newLogger;
}

/**
 * Global logger instance with backward compatibility
 * Uses Proxy to delegate all calls to the current logger instance
 */
export const logger = new Proxy({} as ConsolaInstance, {
  get(_, prop) {
    return _logger[prop as keyof ConsolaInstance];
  },
});

/**
 * Set logger to silent mode (only error messages will be shown)
 */
export function setSilentMode(silent: boolean): void {
  _logger.level = silent ? 1 : process.env.NODE_ENV === "production" ? 3 : 4;
}

export { createConsola } from "consola";

export type Logger = ConsolaInstance;
