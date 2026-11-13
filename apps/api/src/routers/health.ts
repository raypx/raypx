import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { ReadReadiness } from "../app/readiness.js";

const liveness = createRoute({
  method: "get",
  path: "/health",
  operationId: "health.liveness",
  tags: ["Health"],
  summary: "Check process liveness",
  security: [],
  responses: {
    200: {
      description: "Process is running",
      content: { "application/json": { schema: z.object({ status: z.literal("ok") }) } },
    },
  },
});

const checks = z.record(z.string(), z.enum(["ok", "unavailable"]));
const readiness = createRoute({
  method: "get",
  path: "/ready",
  operationId: "health.readiness",
  tags: ["Health"],
  summary: "Check configured backend dependencies",
  security: [],
  responses: {
    200: {
      description: "All configured dependencies are ready",
      content: { "application/json": { schema: z.object({ status: z.literal("ok"), checks }) } },
    },
    503: {
      description: "A dependency is unavailable",
      content: {
        "application/json": { schema: z.object({ status: z.literal("unavailable"), checks }) },
      },
    },
  },
});

export function createHealthRoutes(readReadiness: ReadReadiness) {
  const app = new OpenAPIHono();
  app.openapi(liveness, (c) => c.json({ status: "ok" }, 200));
  app.openapi(readiness, async (c) => {
    c.header("cache-control", "no-store");
    const results = await readReadiness();
    if (Object.values(results).every((status) => status === "ok"))
      return c.json({ status: "ok", checks: results }, 200);
    return c.json({ status: "unavailable", checks: results }, 503);
  });
  return app;
}
