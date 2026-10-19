import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { connectDatabase } from "@raypx/db";
import { schema } from "@raypx/db/schema";
import { createMailer } from "@raypx/mail/server";
import { initLogger } from "@voidmix/logger";
import { createStderrDrain } from "@voidmix/logger/node";
import { createApiApp } from "./api.js";
import { getApiEnvironment, type ApiEnvironment } from "./env.js";

export async function createApiRuntime(environment: ApiEnvironment) {
  const logger = await initLogger({
    service: "raypx-api",
    environment: environment.NODE_ENV,
    drain: createStderrDrain(),
  });
  let connection: ReturnType<typeof connectDatabase> | undefined;
  try {
    connection = connectDatabase(environment.DATABASE_URL);
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
          await logger.close();
        }
      },
    };
  } catch (error) {
    await connection?.close().catch(() => {
      /* Preserve the original startup failure. */
    });
    await logger.close().catch(() => {
      /* Preserve the original startup failure without printing drain errors. */
    });
    throw error;
  }
}
export type ApiRuntime = Awaited<ReturnType<typeof createApiRuntime>>;
let runtimePromise: Promise<ApiRuntime> | undefined;
export function getApiRuntime(): Promise<ApiRuntime> {
  return (runtimePromise ??= Promise.resolve().then(() => createApiRuntime(getApiEnvironment())));
}
export async function closeApiRuntime(): Promise<void> {
  await (await runtimePromise)?.close();
}
