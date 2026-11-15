import { readFileSync } from "node:fs";
import { apiIngress } from "@raypx/tooling/build/deployment";
import { nitroTarget } from "@raypx/tooling/build/nitro";
import { expect, it } from "vitest";
import { openApiAssetsPath } from "../../src/routers/openapi-paths.js";
import { createApiApp } from "../helpers/app.js";

function forwarded(path: string) {
  return (
    apiIngress.prefixes.some((prefix) => path.startsWith(prefix)) ||
    apiIngress.paths.some((exact) => path === exact)
  );
}

it("forwards every mounted API route, including root-mounted OpenAPI and connector routes", () => {
  const app = createApiApp();
  // Global middleware has no endpoint. Scoped middleware and wildcard handlers
  // still reserve their prefix and must reach API.
  const paths = new Set(app.routes.map(({ path }) => path).filter((path) => path !== "/*"));
  expect(paths.size).toBeGreaterThan(0);
  expect([...paths].filter((path) => !forwarded(path))).toEqual([]);
  // Nitro serves these assets; the runtime adds the authenticated event socket.
  expect(forwarded(`${openApiAssetsPath}/swagger-ui-bundle.js`)).toBe(true);
  expect(forwarded("/events")).toBe(true);
});

it.each(["/", "/agents", "/pages", "/pages/example", "/login", "/signup", "/join/example"])(
  "leaves Web destination %s outside API ingress",
  (path) => expect(forwarded(path)).toBe(false),
);

it("leaves API response policies to Hono without outer Nitro header rules", () => {
  const config = readFileSync(new URL("../../vite.app.config.ts", import.meta.url), "utf8");
  expect(config).not.toMatch(/\brouteRules\s*:/);
  expect(nitroTarget()).not.toHaveProperty("routeRules");
});
