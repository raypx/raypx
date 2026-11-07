import { createRailwayContext, project } from "railway/iac";
import { expect, it } from "vite-plus/test";
import { deploymentServices } from "@raypx/tooling/build/deployment";
import program, { partial } from "./railway.js";

const projectId = "766ffb45-d60f-4e4d-83b1-135443ff0b51";

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
      { address: "service.relay", name: "relay" },
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

it("uses shared application images, migration hooks and health paths after relocation", async () => {
  const configuration = await program(
    createRailwayContext({ projectId, environment: "production" }),
    project,
  );
  expect(configuration.resources).toMatchObject([
    {
      build: {
        dockerfilePath: "apps/api/Dockerfile",
        watchPatterns: expect.arrayContaining([
          "apps/api/**",
          "deploy/*.ts",
          "infra/railway/railway.ts",
        ]),
      },
      deploy: {
        preDeployCommand: ["bun run --cwd packages/database migrate"],
        healthcheckPath: deploymentServices.api.ready,
        multiRegionConfig: { "asia-southeast1-eqsg3a": { numReplicas: 1 } },
      },
    },
    {
      build: {
        dockerfilePath: "apps/web/Dockerfile",
        watchPatterns: expect.arrayContaining([
          "apps/web/**",
          "deploy/*.ts",
          "infra/railway/railway.ts",
        ]),
      },
      deploy: { healthcheckPath: deploymentServices.web.health },
    },
    {
      build: {
        dockerfilePath: "infra/relay/Dockerfile",
        watchPatterns: expect.arrayContaining(["infra/relay/**", "infra/railway/railway.ts"]),
      },
      deploy: { healthcheckPath: deploymentServices.relay.ready },
    },
    {
      build: {
        dockerfilePath: "infra/railway/Dockerfile",
        watchPatterns: expect.arrayContaining([
          "infra/railway/Dockerfile",
          "infra/railway/Caddyfile",
        ]),
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
