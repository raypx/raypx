import { afterEach, expect, it } from "vitest";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { checkDeployment } from "./deployment.js";
import { assertDeploymentReadiness } from "./deployment-smoke.js";

it("accepts the current optional connector readiness in combined and Redis-backed deployments", () => {
  expect(() => assertDeploymentReadiness("compose", { database: "ok" })).not.toThrow();
  expect(() =>
    assertDeploymentReadiness("railway", { database: "ok", redis: "ok", relay: "ok" }),
  ).not.toThrow();
  for (const checks of [{ database: "unavailable" }, { database: "ok", relay: "ok" }])
    expect(() => assertDeploymentReadiness("compose", checks)).toThrow("readiness failed");
  for (const checks of [
    { database: "ok", redis: "ok" },
    { database: "ok", redis: "ok", relay: "unavailable" },
  ])
    expect(() => assertDeploymentReadiness("railway", checks)).toThrow("readiness failed");
});

const repository = resolve(import.meta.dirname, "../../../..");
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-deployment-contract-"));
  roots.push(root);
  for (const file of [
    "deploy/compose.yaml",
    "deploy/.env.example",
    "infra/railway/Caddyfile",
    "infra/railway/Dockerfile",
    "apps/api/Dockerfile",
    "apps/web/Dockerfile",
    "deploy/compose.split.yaml",
    "apps/api/src/env.contract.ts",
  ]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(repository, file), join(root, file));
  }
  return root;
}
function replace(root: string, file: string, from: string, to: string) {
  const path = join(root, file);
  writeFileSync(path, readFileSync(path, "utf8").replace(from, to));
}
it("keeps Compose environment inputs, runtime ports and both proxy route maps aligned", () => {
  expect(checkDeployment(fixture())).toEqual([]);
});
it("rejects a proxy that sends authenticated routine ingress to the Web application", () => {
  const root = fixture();
  replace(root, "deploy/compose.yaml", " || PathPrefix(`/routines/`)", "");
  replace(root, "infra/railway/Caddyfile", " /routines/*", "");
  expect(checkDeployment(root)).toEqual(
    expect.arrayContaining([
      "deploy/compose.yaml: API ingress routes differ from the deployment contract",
      "infra/railway/Caddyfile: API ingress routes differ from the deployment contract",
    ]),
  );
});
it("detects newly declared API settings missing from deployment adapters", () => {
  const root = fixture();
  replace(
    root,
    "apps/api/src/env.contract.ts",
    '  REDIS_URL: "input",',
    '"NEW_SETTING": "input",\n  REDIS_URL: "input",',
  );
  expect(checkDeployment(root)).toEqual([
    "deploy/compose.yaml: API does not forward NEW_SETTING",
    "deploy/.env.example: missing API setting NEW_SETTING",
  ]);
});
it("rejects silent port, readiness and ingress route drift", () => {
  const root = fixture();
  replace(root, "deploy/compose.yaml", ":3002/ready", ":3002/health");
  replace(
    root,
    "deploy/compose.yaml",
    ".loadbalancer.server.port=3002",
    ".loadbalancer.server.port=9999",
  );
  replace(root, "infra/railway/Caddyfile", " /ready", "");
  replace(root, "infra/railway/Caddyfile", "{$API_UPSTREAM}", "{$RELAY_UPSTREAM}");
  replace(root, "apps/web/Dockerfile", "EXPOSE 3000", "EXPOSE 9999");
  expect(checkDeployment(root)).toEqual(
    expect.arrayContaining([
      "deploy/compose.yaml: api healthcheck must use 3002/ready",
      "deploy/compose.yaml: api proxy port must be 3002",
      "apps/web/Dockerfile: runtime port must be 3000",
      "infra/railway/Caddyfile: API ingress routes differ from the deployment contract",
      "infra/railway/Caddyfile: Relay ingress must use API_UPSTREAM",
    ]),
  );
});

it("rejects a port that only starts with the required digits", () => {
  const root = fixture();
  replace(root, "apps/api/Dockerfile", "NITRO_PORT=3002", "NITRO_PORT=30020");
  expect(checkDeployment(root)).toContain("apps/api/Dockerfile: runtime port must be 3002");
});
it("reads quoted environment declarations without executing API modules", () => {
  const root = fixture();
  replace(root, "apps/api/src/env.contract.ts", '  REDIS_URL: "input",', '\t"REDIS_URL": "input",');
  writeFileSync(join(root, "apps/api/src/env.ts"), 'throw new Error("must never execute");');
  expect(checkDeployment(root)).toEqual([]);
});
it("ignores build-stage settings and checks the inherited Railway runtime", () => {
  const root = fixture();
  replace(
    root,
    "apps/api/Dockerfile",
    "ENV NODE_ENV=production NITRO_PORT=3002 HOST=0.0.0.0",
    "ENV NODE_ENV=production HOST=0.0.0.0",
  );
  replace(
    root,
    "apps/api/Dockerfile",
    "FROM dependencies AS build",
    "FROM dependencies AS build\nENV NITRO_PORT=3002",
  );
  expect(checkDeployment(root)).toContain("apps/api/Dockerfile: runtime port must be 3002");
  const inherited = fixture();
  replace(
    inherited,
    "apps/api/Dockerfile",
    "FROM runtime AS deploy",
    "FROM runtime AS deploy\nENV NITRO_PORT=30020",
  );
  expect(checkDeployment(inherited)).toContain("apps/api/Dockerfile: runtime port must be 3002");
});

it("requires all by default and a worker in the optional split topology", () => {
  const root = fixture();
  replace(root, "deploy/compose.yaml", "SERVER_ROLE: ${SERVER_ROLE:-all}", "SERVER_ROLE: api");
  replace(root, "deploy/compose.split.yaml", "SERVER_ROLE: worker", "SERVER_ROLE: api");
  expect(checkDeployment(root)).toEqual(
    expect.arrayContaining([
      "deploy/compose.yaml: default backend role must be all",
      "deploy/compose.split.yaml: split roles must share the backend image and declare api, worker and relay",
    ]),
  );
});

it("rejects ingress that strips the connector bearer credential", () => {
  const root = fixture();
  replace(
    root,
    "infra/railway/Caddyfile",
    "header_up -Cookie",
    "header_up -Cookie\n      header_up -Authorization",
  );
  replace(
    root,
    "deploy/compose.yaml",
    "-relay-headers.headers.customrequestheaders.Cookie=",
    "-relay-headers.headers.customrequestheaders.Authorization=",
  );
  expect(checkDeployment(root)).toEqual(
    expect.arrayContaining([
      "infra/railway/Caddyfile: connector ingress must preserve Authorization",
      "deploy/compose.yaml: connector ingress must preserve Authorization",
    ]),
  );
});
