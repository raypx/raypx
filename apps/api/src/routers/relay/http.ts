import { Hono } from "hono";
import { relayHeaders } from "../../middleware/relay-headers.js";
import type { ReadReadiness } from "../../app/readiness.js";

export function createRelayHttpApp(readReadiness: ReadReadiness) {
  const app = new Hono();
  app.use(relayHeaders);
  app.get("/health", (context) => context.json({ status: "ok", service: "relay" }));
  app.get("/ready", async (context) => {
    const checks = await readReadiness();
    const ready = Object.values(checks).every((value) => value === "ok");
    return context.json({ status: ready ? "ok" : "unavailable", checks }, ready ? 200 : 503);
  });
  app.notFound((context) => context.json({ error: "NOT_FOUND" }, 404));
  return app;
}
