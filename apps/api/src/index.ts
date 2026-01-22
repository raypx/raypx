import { serve } from "@hono/node-server";
import { auth } from "@raypx/auth";
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
    allowHeaders: ["Content-Type", "Authorization"],
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

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  },
  (info) => {
    logger.info(`API server running on http://${info.address}:${info.port}`);
  },
);
