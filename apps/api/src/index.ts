import { auth } from "@raypx/auth";
import { handleWebhook } from "@raypx/billing";
import { createLogger } from "@raypx/logger";
import { handleRPCRequest } from "@raypx/rpc/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { env } from "./env";

const app = new Hono();

const logger = createLogger({ name: "api" });

// CORS middleware
app.use(
  "*",
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://raypx.com",
      "https://docs.raypx.com",
    ],
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
  }),
);

// Request logging
if (env.NODE_ENV === "development") {
  app.use("*", honoLogger());
}

// Health check
app.get("/health", (c) => {
  return c.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("/api/health", (c) => {
  return c.json({ ok: true, timestamp: new Date().toISOString() });
});

// Better-auth handler
app.all("/api/auth/*", async (c) => {
  try {
    const response = await auth.handler(c.req.raw);
    return response;
  } catch (error) {
    logger.error("Auth handler error", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// oRPC handler
app.all("/api/rpc/*", async (c) => {
  try {
    const response = await handleRPCRequest(c.req.raw);
    return response;
  } catch (error) {
    logger.error("RPC handler error", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Stripe webhook handler
app.post("/api/webhooks/stripe", async (c) => {
  try {
    const body = await c.req.text();
    const signature = c.req.header("stripe-signature") ?? "";

    if (!signature) {
      return c.json({ error: "Missing stripe-signature header" }, 400);
    }

    const { received } = await handleWebhook(body, signature);
    return c.json({ received });
  } catch (error) {
    logger.error("Stripe webhook error", error);
    return c.json({ error: "Webhook processing failed" }, 500);
  }
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

// Error handler
app.onError((err, c) => {
  logger.error("Unhandled error", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = env.PORT;

logger.info(`Starting API server on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};

// For Bun.serve
if (import.meta.main) {
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  logger.info(`🚀 API server running at http://localhost:${port}`);
}
