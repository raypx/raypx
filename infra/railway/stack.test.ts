import { createRailwayContext, project } from "railway/iac";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { apiIngress, deploymentServices, relayIngress } from "@raypx/tooling/build/deployment";
import program, { partial } from "./railway.js";

const projectId = "766ffb45-d60f-4e4d-83b1-135443ff0b51";

it("matches exactly the shared API ingress and preserves upstream response headers", () => {
  const caddy = readFileSync(new URL("./Caddyfile", import.meta.url), "utf8");
  const matcher = caddy
    .match(/@api path ([^\n]+)/)?.[1]
    ?.trim()
    .split(/\s+/);
  expect(matcher?.sort()).toEqual([`${apiIngress.prefix}*`, ...apiIngress.exceptions].sort());
  expect(caddy).toMatch(/handle @api\s*\{\s*reverse_proxy \{\$API_UPSTREAM\}/);
  expect(caddy).toMatch(/handle\s*\{\s*reverse_proxy \{\$WEB_UPSTREAM\}/);
  // Response headers, including the Page sandbox/CSP, belong to the upstream.
  expect(caddy).not.toMatch(/^\s*(?:header|header_down)\b/m);
  expect(caddy).toContain(`@relay path ${relayIngress.paths.join(" ")}`);
  expect(caddy).toMatch(
    /handle @relay\s*\{\s*reverse_proxy \{\$API_UPSTREAM\}\s*\{\s*header_up -Cookie\s*\}/,
  );
});

it("owns only application services and leaves operator variables and storage unmanaged", async () => {
  const configuration = await program(
    createRailwayContext({ projectId, environment: "production" }),
    project,
  );
  expect(partial).toBe("raypx-app");
  expect(configuration).toMatchObject({
    name: "raypx",
    variables: { managed: false },
    resources: [
      { address: "service.api", name: "api" },
      { address: "service.web", name: "web" },
      { address: "service.gateway", name: "gateway" },
    ],
  });
  for (const resource of configuration.resources!)
    expect(resource).toMatchObject({
      source: {
        type: "github",
        repo: "raypx/raypx",
        branch: "canary",
        checkSuites: true,
      },
    });
});

it("deploys the whole canary revision after CI, even after a docs-only push", async () => {
  const configuration = await program(
    createRailwayContext({ projectId, environment: "production" }),
    project,
  );
  expect(configuration.resources).toMatchObject([
    {
      build: {
        dockerfilePath: "apps/api/Dockerfile",
        watchPatterns: [],
      },
      deploy: {
        preDeployCommand: ["bun run --cwd apps/api db:migrate"],
        healthcheckPath: deploymentServices.api.ready,
        multiRegionConfig: { "asia-southeast1-eqsg3a": { numReplicas: 1 } },
      },
    },
    {
      build: {
        dockerfilePath: "apps/web/Dockerfile",
        watchPatterns: [],
      },
      deploy: { healthcheckPath: deploymentServices.web.health },
    },
    {
      build: {
        dockerfilePath: "infra/railway/Dockerfile",
        watchPatterns: [],
      },
      deploy: { healthcheckPath: deploymentServices.gateway.ready },
    },
  ]);
});

it.each([
  { projectId: "another-project", environment: "production" },
  { projectId, environment: "staging" },
])("rejects the wrong project or environment: %j", (context) => {
  expect(() => program(createRailwayContext(context), project)).toThrow(
    "Link the Raypx Railway production environment",
  );
});
