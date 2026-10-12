import {
  createLogger as createEvlogLogger,
  defineEvlog,
  initLogger as initEvlogLogger,
  toLoggerConfig,
  toMiddlewareOptions,
  type AuditableLogger,
  type EvlogConfig,
  type LogLevel,
} from "evlog";

import { getLoggerEnv } from "./env.js";

const sensitivePaths = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "passwordHash",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "sessionToken",
  "apiKey",
  "prompt",
  "fileContent",
  "signedUrl",
  "downloadUrl",
  "uploadUrl",
  "**.authorization",
  "**.cookie",
  "**.set-cookie",
  "**.password",
  "**.passwordHash",
  "**.secret",
  "**.token",
  "**.accessToken",
  "**.refreshToken",
  "**.sessionToken",
  "**.apiKey",
  "**.prompt",
  "**.fileContent",
  "**.signedUrl",
  "**.downloadUrl",
  "**.uploadUrl",
];

export interface LoggerOptions {
  service: string;
  environment?: string;
  enabled?: boolean;
  pretty?: boolean;
  minLevel?: LogLevel;
  version?: string;
  silent?: boolean;
  drain?: EvlogConfig["drain"];
  runtimeEnv?: Record<string, string | boolean | number | undefined>;
}

export function createLoggerConfig(options: LoggerOptions): EvlogConfig {
  const loggerEnvironment = getLoggerEnv(options.runtimeEnv);
  const environment = options.environment ?? loggerEnvironment.NODE_ENV;

  return defineEvlog({
    service: options.service,
    environment,
    enabled: options.enabled ?? true,
    pretty: options.pretty ?? loggerEnvironment.LOG_PRETTY ?? environment === "development",
    minLevel:
      options.minLevel ??
      loggerEnvironment.LOG_LEVEL ??
      (environment === "production" ? "info" : "debug"),
    stringify: true,
    silent: options.silent ?? false,
    ...(options.drain ? { drain: options.drain } : {}),
    env: {
      service: options.service,
      environment,
      ...(options.version ? { version: options.version } : {}),
    },
    redact: {
      paths: sensitivePaths,
    },
  });
}

export function configureLogger(options: LoggerOptions): EvlogConfig {
  const config = createLoggerConfig(options);
  initEvlogLogger(toLoggerConfig(config));
  return config;
}

export function logger<T extends object = Record<string, unknown>>(
  initialContext?: Record<string, unknown>,
): AuditableLogger<T> {
  return createEvlogLogger<T>(initialContext);
}

export { toLoggerConfig, toMiddlewareOptions };
export type { AuditableLogger, EvlogConfig, LogLevel, WideEvent } from "evlog";
