import evlog from 'evlog';

/**
 * Logger options
 */
export interface LoggerOptions {
  name?: string;
  level?: number;
}

/**
 * Create a logger instance
 *
 * Uses evlog (v2.30.1) for structured logging
 *
 * @param options - Logger configuration options
 * @returns Configured logger instance
 *
 * @example
 * ```typescript
 * import { createLogger } from '@raypx/logger';
 *
 * const logger = createLogger({ name: 'api-service' });
 * logger.info('Application started');
 * logger.error('Error occurred', { error });
 * ```
 */
export function createLogger(options: LoggerOptions = {}) {
  const name = options.name || 'raypx';
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // evlog 2.x uses numeric levels: 0=trace, 1=debug, 2=info, 3=warn, 4=error, 5=fatal
  const level = options.level ?? (isDevelopment ? 1 : 2); // debug in dev, info in prod

  return evlog.withTag(name).withDefaults({ level });
}

/**
 * Default logger instance for quick logging
 *
 * @example
 * ```typescript
 * import { logger } from '@raypx/logger';
 *
 * logger.info('Application started');
 * logger.warn('Warning message', { userId: 123 });
 * logger.error('Error occurred', { error: err });
 * logger.debug('Debug info', { request });
 * ```
 */
export const logger = createLogger();

// Re-export evlog for advanced usage
export { evlog };
export default logger;
