import * as Sentry from "@sentry/react";
import { env } from "./env";

let initialized = false;

export function initSentry() {
  if (initialized) return;
  if (!env.NEXT_PUBLIC_SENTRY_DSN) return;

  // Skip in development unless explicitly enabled
  if (env.NODE_ENV === "development" && !env.NEXT_PUBLIC_SENTRY_ENABLE_DEV) {
    return;
  }

  Sentry.init({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });

  initialized = true;
}

export function captureError(error: Error, context?: Record<string, unknown>) {
  if (!initialized) return;

  Sentry.captureException(error, {
    extra: context,
  });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = "info") {
  if (!initialized) return;

  Sentry.captureMessage(message, level);
}

export function setUser(user: { id: string; email?: string; name?: string }) {
  if (!initialized) return;

  Sentry.setUser({
    id: user.id,
    email: user.email,
    username: user.name,
  });
}

export function clearUser() {
  if (!initialized) return;

  Sentry.setUser(null);
}

export { Sentry };
