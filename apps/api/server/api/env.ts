import { databaseEnv } from "@voidmix/db/env";
import { cacheEnv } from "@voidmix/cache/env";
import { type Preset, z } from "@voidmix/shared/env";
import { runtimeEnv } from "@voidmix/shared/env/runtime";
import type { LogLevel } from "@voidmix/shared/logger";
import { loggerEnv } from "@voidmix/shared/logger/env";
import { mailEnv } from "@voidmix/mail/env";

const splitOrigins = (value: string): string[] =>
  value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const apiRuntimeEnv = {
  id: "api",
  extends: [runtimeEnv, loggerEnv, databaseEnv, mailEnv, cacheEnv],
  server: {
    ALLOWED_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform(splitOrigins)
      .pipe(z.array(z.url())),
    AUTH_SECRET: z.string().trim().min(32).default("voidmix-development-secret-change-me"),
    AUTH_URL: z.url(),
    AUTH_DOMAIN: z.string().trim().min(1).optional(),
    BLOB_STORAGE_DIR: z.string().trim().min(1).optional(),
    CLOUD_SEARCH_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CLOUD_COMPUTER_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    CLOUD_DELEGATION_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    CLOUD_EXPORT_ENABLED: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    CLOUD_ACCOUNT_MODEL_CALL_LIMIT: z.coerce.number().int().positive().optional(),
    CLOUD_MODEL_PROVIDER: z.string().min(1).optional(),
    CLOUD_MODEL_ID: z.string().min(1).optional(),
    CLOUD_MODEL_API_KEY: z.string().min(1).optional(),
    BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
    CLOUD_ACCOUNT_CONCURRENCY: z.coerce.number().int().positive().optional(),
    CLOUD_ACCOUNT_STORAGE_BYTES: z.coerce.number().int().positive().optional(),
    CLOUD_REQUEST_LIMIT: z.coerce.number().int().positive().default(20),
    S3_BUCKET: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    SENTRY_DSN: z.url().optional(),
  },
} as const satisfies Preset;

export interface ApiRuntimeEnvironment {
  NODE_ENV: "development" | "production" | "test";
  DATABASE_URL: string;
  REDIS_URL?: string | undefined;
  CACHE_PREFIX: string;
  CACHE_REDIS_CONNECT_TIMEOUT_MS: number;
  CACHE_REDIS_OPERATION_TIMEOUT_MS: number;
  CACHE_REDIS_MAX_RETRIES_PER_REQUEST: number;
  ALLOWED_ORIGINS: string[];
  AUTH_SECRET: string;
  AUTH_URL: string;
  AUTH_DOMAIN?: string | undefined;
  BLOB_STORAGE_DIR?: string | undefined;
  CLOUD_SEARCH_ENABLED?: boolean | undefined;
  CLOUD_COMPUTER_ENABLED?: boolean | undefined;
  CLOUD_DELEGATION_ENABLED?: boolean | undefined;
  CLOUD_EXPORT_ENABLED?: boolean | undefined;
  CLOUD_ACCOUNT_MODEL_CALL_LIMIT?: number | undefined;
  CLOUD_MODEL_PROVIDER?: string | undefined;
  CLOUD_MODEL_ID?: string | undefined;
  CLOUD_MODEL_API_KEY?: string | undefined;
  BRAVE_SEARCH_API_KEY?: string | undefined;
  CLOUD_ACCOUNT_CONCURRENCY?: number | undefined;
  CLOUD_ACCOUNT_STORAGE_BYTES?: number | undefined;
  CLOUD_REQUEST_LIMIT?: number | undefined;
  S3_BUCKET?: string | undefined;
  S3_REGION?: string | undefined;
  S3_ENDPOINT?: string | undefined;
  S3_FORCE_PATH_STYLE?: boolean | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  SENTRY_DSN?: string | undefined;
  RESEND_API_KEY?: string | undefined;
  MAIL_FROM?: string | undefined;
  MAIL_FROM_NAME?: string | undefined;
  EMAIL_TEMPLATES_BASE_URL?: string | undefined;
  MAIL_DEFAULT_LOCALE?: string | undefined;
  LOG_LEVEL?: LogLevel | undefined;
  LOG_PRETTY?: boolean | undefined;
}
