import { readFileSync } from "node:fs";
import { apiIngress } from "@raypx/tooling/build/deployment";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import { expect, it, vi } from "vitest";
import { openApiAssetsPath } from "../../src/routers/openapi-paths.js";
import { createApiApp, testAppOptions } from "../helpers/app.js";
import { assertApiIngress, apiRootExceptions } from "../../src/routers/ingress.js";
import { createConversationSocketRoutes } from "../../src/conversations/socket.js";
import type { ConversationStream } from "../../src/conversations/stream.js";
import { createDeviceConnectorRoutes } from "../../src/routers/device-connector.js";
import { createRelayHttpApp } from "../../src/routers/relay/http.js";

it("mounts every real API, event, Relay and worker endpoint within one namespace or a root exception", () => {
  expect(apiIngress).toEqual({ prefix: "/api/", exceptions: apiRootExceptions });
  const app = createApiApp().route(
    "/api/events",
    createConversationSocketRoutes({
      // Route inventory needs no live stream or database.
      stream: {} as ConversationStream,
      allowedOrigins: [],
      readSession: async () => null,
    }),
  );
  const relay = createRelayHttpApp(async () => ({})).route(
    "/",
    createDeviceConnectorRoutes(testAppOptions().deviceConnector),
  );
  const worker = createRelayHttpApp(async () => ({}), "worker");
  for (const router of [app, relay, worker]) {
    expect(router.routes.length).toBeGreaterThan(0);
    expect(() => assertApiIngress(router.routes)).not.toThrow();
  }
  expect(openApiAssetsPath.startsWith(apiIngress.prefix)).toBe(true);
});

it.each(["/outside", "/api", "/api-other/route", "/health/extra", "/.well-known/other", "/*"])(
  "refuses an undeclared endpoint %s in source and production startup",
  (path) => {
    const app = createApiApp().get(path, (c) => c.text("unexpected"));
    expect(() => assertApiIngress(app.routes)).toThrow("outside its ingress namespace");
  },
);

it.each([
  "/rpc/spaces/list",
  "/events",
  "/device/connect",
  "/routines/example/webhook",
  "/page-content/public/example",
  "/message-attachments/space/conversation/attachment",
])("does not mount or redirect the removed path %s", async (path) => {
  const readSession = vi.fn(async () => null);
  const app = createApiApp({ readSession });
  for (const method of ["GET", "POST"]) {
    const response = await app.request(path, { method });
    expect(response.status).toBe(404);
    expect(response.headers.has("location")).toBe(false);
  }
  expect(readSession).not.toHaveBeenCalled();
});

it("leaves API response policies to Hono without outer Nitro header rules", () => {
  const config = readFileSync(new URL("../../vite.app.config.ts", import.meta.url), "utf8");
  expect(config).not.toMatch(/\brouteRules\s*:/);
  expect(nitroTarget()).not.toHaveProperty("routeRules");
});
