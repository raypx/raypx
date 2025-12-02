/**
 * Error logging middleware for tRPC
 * Captures and logs errors with contextual information
 */

import { TRPCError } from "@trpc/server";
import type { AppErrorCode, ErrorMeta } from "../errors";
import { isAppError } from "../errors";

/**
 * Log levels for different error severities
 */
export enum LogLevel {
  ERROR = "error",
  WARN = "warn",
  INFO = "info",
  DEBUG = "debug",
}

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  level: LogLevel;
  message: string;
  errorCode?: AppErrorCode;
  trpcCode: string;
  path: string;
  method: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  stack?: string;
  userId?: string;
  error?: TRPCError;
}

/**
 * Determine log level based on error type
 */
function getLogLevel(error: TRPCError): LogLevel {
  // Client errors (4xx) are warnings
  if (
    error.code === "BAD_REQUEST" ||
    error.code === "UNAUTHORIZED" ||
    error.code === "FORBIDDEN" ||
    error.code === "NOT_FOUND" ||
    error.code === "UNPROCESSABLE_CONTENT"
  ) {
    return LogLevel.WARN;
  }

  // Server errors (5xx) are errors
  if (error.code === "INTERNAL_SERVER_ERROR") {
    return LogLevel.ERROR;
  }

  // Rate limiting is info
  if (error.code === "TOO_MANY_REQUESTS") {
    return LogLevel.INFO;
  }

  // Default to error
  return LogLevel.ERROR;
}

/**
 * Format error for logging
 */
function formatErrorLog(
  error: TRPCError,
  path: string,
  type: string,
  userId?: string,
): ErrorLogEntry {
  const isApp = isAppError(error);
  const meta = isApp ? (error.cause as ErrorMeta) : undefined;

  return {
    level: getLogLevel(error),
    message: error.message,
    errorCode: meta?.code,
    trpcCode: error.code,
    path,
    method: type,
    timestamp: meta?.timestamp || new Date(),
    context: meta?.context,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    userId,
    error,
  };
}

/**
 * Log error to console with proper formatting
 */
function logError(entry: ErrorLogEntry): void {
  const { level, message, errorCode, trpcCode, path, method, context, userId, stack } = entry;

  // Format log message
  const logMessage = [
    `[tRPC Error] ${method.toUpperCase()} ${path}`,
    `Code: ${errorCode || trpcCode}`,
    `Message: ${message}`,
    userId ? `User: ${userId}` : null,
    context ? `Context: ${JSON.stringify(context)}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  // Log based on level
  switch (level) {
    case LogLevel.ERROR:
      console.error(logMessage);
      if (stack) console.error("Stack:", stack);
      break;
    case LogLevel.WARN:
      console.warn(logMessage);
      break;
    case LogLevel.INFO:
      break;
    case LogLevel.DEBUG:
      console.debug(logMessage);
      break;
  }

  // TODO: Send to external logging service (e.g., Sentry, LogRocket, etc.)
  // Example:
  // if (process.env.NODE_ENV === "production" && (level === LogLevel.ERROR || level === LogLevel.WARN)) {
  //   await logger.error(entry);
  // }
}

/**
 * Error logging middleware
 * Catches and logs all errors with contextual information
 */
export const errorLoggingMiddleware = async ({ ctx, path, type, next }: any) => {
  try {
    return await next();
  } catch (error) {
    // Only log TRPCErrors (other errors should be caught by global error handler)
    if (error instanceof TRPCError) {
      const userId = ctx.session?.user?.id;
      const logEntry = formatErrorLog(error, path, type, userId);
      logError(logEntry);
    } else {
      // Log unexpected errors
      console.error("[tRPC Unexpected Error]", {
        path,
        type,
        error,
        userId: ctx.session?.user?.id,
      });
    }

    // Re-throw to let tRPC handle the error response
    throw error;
  }
};

/**
 * Performance logging middleware
 * Logs slow requests
 */
export function performanceLoggingMiddleware(thresholdMs = 3000) {
  return async ({ ctx, path, type, next }: any) => {
    const start = Date.now();

    try {
      const result = await next();
      const duration = Date.now() - start;

      // Log slow requests
      if (duration > thresholdMs) {
        console.warn(`[tRPC Slow Request] ${type.toUpperCase()} ${path} took ${duration}ms`, {
          userId: ctx.session?.user?.id,
          threshold: thresholdMs,
        });

        // TODO: Send to monitoring service (e.g., DataDog, New Relic)
      }

      return result;
    } catch (error) {
      throw error;
    }
  };
}
