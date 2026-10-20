import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import type { DatabaseConnection } from "@raypx/database/connection";
import { schema } from "@raypx/database/schema";
import { createMailer } from "@raypx/mail/server";
import type { ApiLogging } from "../logging.js";
import { createApiApp } from "../api.js";
import type { ApiEnvironment } from "../env.js";

export interface RuntimeResources {
  logger: ApiLogging;
  connect(): DatabaseConnection;
  closeLogger(): Promise<void>;
}

export async function createRuntime(environment: ApiEnvironment, resources: RuntimeResources) {
  const { logger } = resources;
  let connection: DatabaseConnection | undefined;
  try {
    connection = resources.connect();
    const mailer = createMailer({
      defaultLocale: environment.MAIL_DEFAULT_LOCALE,
      ...(environment.RESEND_API_KEY ? { apiKey: environment.RESEND_API_KEY } : {}),
      ...(environment.MAIL_FROM ? { from: environment.MAIL_FROM } : {}),
    });
    const auth = createAuth({
      database: drizzleAdapter(connection.db, { provider: "pg", schema }),
      mailer,
      config: {
        baseURL: environment.AUTH_URL,
        secret: environment.AUTH_SECRET,
        trustedOrigins: environment.allowedOrigins,
        production: environment.NODE_ENV === "production",
        ...(environment.AUTH_DOMAIN ? { cookieDomain: environment.AUTH_DOMAIN } : {}),
      },
    });
    return {
      app: createApiApp({
        authHandler: (request) => auth.handler(request),
        readSession: (headers) => readAuthSession(auth, headers),
        allowedOrigins: environment.allowedOrigins,
        mailAvailable: mailer.available,
        logger,
      }),
      close: async () => {
        try {
          await connection?.close();
        } finally {
          await resources.closeLogger();
        }
      },
    };
  } catch (error) {
    await connection?.close().catch(() => {
      /* Preserve the original startup failure. */
    });
    await resources.closeLogger().catch(() => {
      /* Preserve the original startup failure without printing drain errors. */
    });
    throw error;
  }
}
export type ApiRuntime = Awaited<ReturnType<typeof createRuntime>>;
