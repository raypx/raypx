import { createSentry } from "@raypx/analytics/sentry/server";
import { createMiddleware, createStart } from "@tanstack/react-start";

const sentry = createSentry();

const sentryGlobalMiddleware = createMiddleware().server(
  sentry.sentryGlobalServerMiddlewareHandler(),
);

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [sentryGlobalMiddleware],
  };
});
