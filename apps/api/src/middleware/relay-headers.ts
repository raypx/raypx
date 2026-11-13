import { createMiddleware } from "hono/factory";

export const relayHeaders = createMiddleware(async (context, next) => {
  await next();
  context.header("cache-control", "no-store");
  context.header("x-content-type-options", "nosniff");
  context.header("content-security-policy", "default-src 'none'");
  context.header("x-frame-options", "DENY");
});
