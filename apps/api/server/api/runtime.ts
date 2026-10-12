import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  connectDatabase,
  PostgresSystemSettingsRepository,
  PostgresUserRepository,
  FileSystemBlobStorageRepository,
  PostgresCloudRepository,
  PostgresOrganizationMemberV2Repository,
  PostgresProjectMemberV2Repository,
  PostgresProjectTaskV2Repository,
  PostgresProjectV2Repository,
  PostgresReviewV2Repository,
  PostgresFeedbackV2Repository,
  PostgresAssetV2Repository,
  PostgresAssetVersionV2Repository,
  PostgresActivityV2Repository,
} from "@voidmix/db";
import {
  createCloudApplication,
  createProjectApplication,
  createProjectAccess,
  createAssetApplication,
  createReviewApplication,
  createActivityApplication,
} from "@voidmix/application";
import type { RedisCacheConnection } from "@voidmix/cache";
import type { AuthSettings, MailSettingsFallback, ObjectStorage } from "@voidmix/core";
import { createLoggerConfig, type EvlogConfig } from "@voidmix/shared/logger";
import { getMailEnv } from "@voidmix/mail/env";
import { createMailer } from "@voidmix/mail/server";

import { createApiApp } from "./app.js";
import { createExecutionGateway } from "./execution-gateway.js";
import { createApiAuth } from "./auth/config.js";
import type { ApiRuntimeEnvironment } from "./env.js";
import { createApiModules } from "./modules.js";
import { createBetterAuthSessionResolver } from "./session.js";
import { createProblemDetails, problemContentType } from "./problem.js";
import { createS3Storage, createFilesystemStorage } from "@voidmix/storage";
import { cloudConfiguration, createCloudAdmission } from "./cloud-config.js";
import { createErrorReporter } from "./telemetry.js";
import { connectAdmissionCache } from "./admission-cache.js";
import { createApiError } from "./canonical-errors.js";

export interface ApiRuntime {
  app: ReturnType<typeof createApiApp>;
  close(): Promise<void>;
}

export interface CreateApiRuntimeOptions {
  environment: ApiRuntimeEnvironment;
  loggerConfig?: EvlogConfig;
}

export async function createApiRuntime({
  environment,
  loggerConfig = createLoggerConfig({
    service: "api",
    environment: environment.NODE_ENV,
    ...(environment.LOG_PRETTY !== undefined ? { pretty: environment.LOG_PRETTY } : {}),
    ...(environment.LOG_LEVEL !== undefined ? { minLevel: environment.LOG_LEVEL } : {}),
  }),
}: CreateApiRuntimeOptions): Promise<ApiRuntime> {
  const connection = connectDatabase(environment.DATABASE_URL);
  const reporter = createErrorReporter({
    environment: environment.NODE_ENV,
    ...(environment.SENTRY_DSN ? { dsn: environment.SENTRY_DSN } : {}),
  });
  let cacheConnection: RedisCacheConnection | undefined;
  let objectStorage: ObjectStorage | undefined;

  try {
    if (environment.REDIS_URL && environment.NODE_ENV !== "test") {
      cacheConnection = await connectAdmissionCache({
        url: environment.REDIS_URL,
        prefix: environment.CACHE_PREFIX,
        connectTimeoutMs: environment.CACHE_REDIS_CONNECT_TIMEOUT_MS,
        operationTimeoutMs: environment.CACHE_REDIS_OPERATION_TIMEOUT_MS,
        maxRetriesPerRequest: environment.CACHE_REDIS_MAX_RETRIES_PER_REQUEST,
      });
    }
    const mailEnvironment = getMailEnv({
      NODE_ENV: environment.NODE_ENV,
      MAIL_FROM: environment.MAIL_FROM,
      MAIL_FROM_NAME: environment.MAIL_FROM_NAME,
      RESEND_API_KEY: environment.RESEND_API_KEY,
      EMAIL_TEMPLATES_BASE_URL: environment.EMAIL_TEMPLATES_BASE_URL,
      MAIL_DEFAULT_LOCALE: environment.MAIL_DEFAULT_LOCALE,
    });
    const mailFallback = toMailFallback(environment);
    const settings = new PostgresSystemSettingsRepository(connection.db);
    const mailer = createMailer({
      env: mailEnvironment,
      resolveConfiguration: async () => {
        const configuration = await settings.resolveMailConfiguration(mailFallback);
        return {
          enabled: configuration.settings.enabled,
          from: configuration.settings.from,
          fromName: configuration.settings.fromName,
          templatesBaseUrl: configuration.settings.templatesBaseUrl,
          resendApiKey: configuration.resendApiKey,
        };
      },
    });
    const getAuthSettings = () => settings.resolveAuthSettings();
    const auth = createApiAuth({
      connection,
      environment,
      mailer,
      getAuthSettings,
    });
    const authHandler = createMailProtectedAuthHandler({
      handler: auth.handler,
      getAuthSettings,
      getMailSettings: async () => (await settings.resolveMailConfiguration(mailFallback)).settings,
    });
    const projectPorts = {
      projects: new PostgresProjectV2Repository(connection.db),
      projectMembers: new PostgresProjectMemberV2Repository(connection.db),
      organizationMembers: new PostgresOrganizationMemberV2Repository(connection.db),
    };
    const access = createProjectAccess(projectPorts);
    const assetVersions = new PostgresAssetVersionV2Repository(connection.db);
    const v2Projects = createProjectApplication({
      ...projectPorts,
      tasks: new PostgresProjectTaskV2Repository(connection.db),
    });
    const cloudConfig = cloudConfiguration(environment);
    if (environment.NODE_ENV === "production" && !environment.S3_BUCKET)
      throw new Error("S3_BUCKET must configure private production object storage.");
    objectStorage = environment.S3_BUCKET
      ? createS3Storage({
          bucket: environment.S3_BUCKET,
          region: environment.S3_REGION ?? "us-east-1",
          ...(environment.S3_ENDPOINT ? { endpoint: environment.S3_ENDPOINT } : {}),
          forcePathStyle: environment.S3_FORCE_PATH_STYLE ?? false,
          ...(environment.S3_ACCESS_KEY_ID && environment.S3_SECRET_ACCESS_KEY
            ? {
                credentials: {
                  accessKeyId: environment.S3_ACCESS_KEY_ID,
                  secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
                },
              }
            : {}),
        })
      : createFilesystemStorage({
          directory: environment.BLOB_STORAGE_DIR ?? join(tmpdir(), "voidmix-cloud-objects"),
          signingSecret: environment.AUTH_SECRET,
          publicBaseUrl: environment.AUTH_URL,
        });
    const admission = createCloudAdmission({
      production: environment.NODE_ENV === "production",
      flags: cloudConfig.flags,
      requestLimit: environment.CLOUD_REQUEST_LIMIT ?? 20,
      ...(cacheConnection
        ? {
            increment: (key: string, ttl: number) =>
              cacheConnection!.secondaryStorage.increment(key, ttl),
          }
        : {}),
    });
    let modelReady = false;
    const cloud = createCloudApplication({
      repository: new PostgresCloudRepository(connection.db),
      limits: cloudConfig.limits,
      admitRun: async ({ actorId, mode }) => {
        await admission(actorId, mode);
        if (!modelReady) throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_MODEL_UNAVAILABLE");
        if (mode === "search" && !environment.BRAVE_SEARCH_API_KEY)
          throw createApiError("SERVICE_UNAVAILABLE", "CLOUD_SEARCH_UNAVAILABLE");
      },
    });
    const executionGateway = await createExecutionGateway({
      app: cloud,
      storage: objectStorage,
      ...(environment.CLOUD_MODEL_PROVIDER &&
      environment.CLOUD_MODEL_ID &&
      environment.CLOUD_MODEL_API_KEY
        ? {
            model: {
              provider: environment.CLOUD_MODEL_PROVIDER,
              id: environment.CLOUD_MODEL_ID,
              apiKey: environment.CLOUD_MODEL_API_KEY,
            },
          }
        : {}),
      ...(environment.BRAVE_SEARCH_API_KEY
        ? { searchApiKey: environment.BRAVE_SEARCH_API_KEY }
        : {}),
    });
    modelReady = executionGateway.modelReady;
    const assets = createAssetApplication({
      access,
      assets: new PostgresAssetV2Repository(connection.db),
      assetVersions,
      blobStorage: new FileSystemBlobStorageRepository(
        environment.BLOB_STORAGE_DIR ?? ".voidmix/blobs",
      ),
    });
    const reviews = createReviewApplication({
      access,
      assetVersions,
      reviews: new PostgresReviewV2Repository(connection.db),
      feedback: new PostgresFeedbackV2Repository(connection.db),
    });
    const activity = createActivityApplication({
      access,
      activity: new PostgresActivityV2Repository(connection.db),
    });
    const modules = createApiModules({
      v2Projects,
      cloud,
      objectStorage,
      cloudCapabilities: {
        ...cloudConfig.flags,
        search: cloudConfig.flags.search && modelReady && !!environment.BRAVE_SEARCH_API_KEY,
        computer: cloudConfig.flags.computer && modelReady,
        unavailableReason:
          environment.NODE_ENV === "production" && !cacheConnection
            ? "CLOUD_RATE_LIMIT_UNAVAILABLE"
            : !cloudConfig.flags.search && !cloudConfig.flags.computer
              ? "CLOUD_CAPABILITY_DISABLED"
              : !modelReady
                ? "CLOUD_MODEL_UNAVAILABLE"
                : cloudConfig.flags.search &&
                    !cloudConfig.flags.computer &&
                    !environment.BRAVE_SEARCH_API_KEY
                  ? "CLOUD_SEARCH_UNAVAILABLE"
                  : null,
      },
      reportError: reporter.report,
      traceOperation: reporter.trace,
      assets,
      reviews,
      activity,
      users: new PostgresUserRepository(connection.db),
      settings,
      mailFallback,
      resolveAuthSettings: getAuthSettings,
    });
    let closePromise: Promise<void> | undefined;

    return {
      app: createApiApp({
        modules,
        executionGateway,
        allowedOrigins: environment.ALLOWED_ORIGINS,
        authHandler,
        resolveSession: createBetterAuthSessionResolver(auth),
        loggerConfig,
        ...(!environment.S3_BUCKET
          ? { localStorage: { storage: objectStorage, signingSecret: environment.AUTH_SECRET } }
          : {}),
      }),
      close(): Promise<void> {
        closePromise ??= executionGateway
          .close()
          .then(() =>
            Promise.all([
              connection.close(),
              ...(cacheConnection ? [cacheConnection.close()] : []),
              reporter.close(),
              ...(objectStorage?.close ? [objectStorage.close()] : []),
            ]),
          )
          .then(() => undefined);
        return closePromise;
      },
    };
  } catch (error) {
    await cacheConnection?.close().catch(() => undefined);
    await objectStorage?.close?.().catch(() => undefined);
    await connection.close();
    await reporter.close();
    throw error;
  }
}

const mailProtectedAuthPaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/request-password-reset",
  "/api/auth/send-verification-email",
]);

export function createMailProtectedAuthHandler(options: {
  handler: (request: Request) => Promise<Response>;
  getAuthSettings: () => Promise<AuthSettings>;
  getMailSettings: () => Promise<{ configurationState: "ready" | "disabled" | "incomplete" }>;
}): (request: Request) => Promise<Response> {
  return async (request) => {
    const path = new URL(request.url).pathname;
    const requestId = request.headers.get("x-request-id") ?? "unknown";
    if (request.method === "POST" && mailProtectedAuthPaths.has(path)) {
      const authSettings = await options.getAuthSettings();
      if (path === "/api/auth/sign-up/email") {
        if (authSettings.registrationMode === "closed") {
          return authPolicyResponse("REGISTRATION_DISABLED", 403, requestId);
        }
        if (!authSettings.verificationEmailEnabled) {
          return authPolicyResponse("EMAIL_VERIFICATION_DISABLED", 403, requestId);
        }
        const emailDomain = await readEmailDomain(request);
        if (
          emailDomain &&
          authSettings.allowedEmailDomains.length > 0 &&
          !authSettings.allowedEmailDomains.includes(emailDomain)
        ) {
          return authPolicyResponse("EMAIL_DOMAIN_NOT_ALLOWED", 400, requestId);
        }
      }
      if (path === "/api/auth/send-verification-email" && !authSettings.verificationEmailEnabled) {
        return authPolicyResponse("EMAIL_VERIFICATION_DISABLED", 403, requestId);
      }
      if (path === "/api/auth/request-password-reset" && !authSettings.passwordResetEmailEnabled) {
        return authPolicyResponse("PASSWORD_RESET_DISABLED", 403, requestId);
      }

      const mailSettings = await options.getMailSettings();
      if (mailSettings.configurationState !== "ready") {
        return authPolicyResponse("MAIL_NOT_CONFIGURED", 503, requestId);
      }
    }
    return options.handler(request);
  };
}

function authPolicyResponse(code: string, status: 400 | 403 | 503, requestId?: string): Response {
  // Keep the top-level code for Better Auth's error handling while exposing the
  // same stable envelope consumed by the application clients.
  const problem = createProblemDetails(code, status, requestId ?? "unknown");
  const response = Response.json({ code, data: { error: { code } }, problem }, { status });
  return problemContentType(response);
}

async function readEmailDomain(request: Request): Promise<string | null> {
  try {
    const body: unknown = await request.clone().json();
    if (typeof body !== "object" || body === null || !("email" in body)) return null;
    const email = body.email;
    if (typeof email !== "string") return null;
    const separator = email.lastIndexOf("@");
    return separator >= 0
      ? email
          .slice(separator + 1)
          .trim()
          .toLowerCase() || null
      : null;
  } catch {
    return null;
  }
}

function toMailFallback(environment: ApiRuntimeEnvironment): MailSettingsFallback {
  return {
    enabled: { value: true, source: "default" },
    from: environment.MAIL_FROM
      ? { value: environment.MAIL_FROM, source: "environment" }
      : { value: null, source: "missing" },
    fromName: environment.MAIL_FROM_NAME
      ? { value: environment.MAIL_FROM_NAME, source: "environment" }
      : { value: "Voidmix", source: "default" },
    templatesBaseUrl: environment.EMAIL_TEMPLATES_BASE_URL
      ? { value: environment.EMAIL_TEMPLATES_BASE_URL, source: "environment" }
      : { value: null, source: "missing" },
    resendApiKey: environment.RESEND_API_KEY
      ? { value: environment.RESEND_API_KEY, source: "environment" }
      : { value: null, source: "missing" },
  };
}
