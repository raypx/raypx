import { defineRailway, github, project, service } from "railway/iac";
import { deploymentServices } from "@raypx/tooling/build/deployment";

// Existing Postgres/Redis services and volumes remain outside this partial.
export const partial = "raypx-app";

export default defineRailway((context) => {
  if (
    context.projectId !== "766ffb45-d60f-4e4d-83b1-135443ff0b51" ||
    context.environment !== "production"
  ) {
    throw new Error("Link the Raypx Railway production environment before applying.");
  }
  const deployment = {
    restartPolicyMaxRetries: 3,
    drainingSeconds: 15,
    overlapSeconds: 0,
  } as const;
  const replicas = { "asia-southeast1-eqsg3a": 1 };
  const source = github("raypx/raypx", { branch: "canary", checkSuites: true });
  const sharedInputs = [
    "deploy/*.ts",
    "infra/*/package.json",
    "packages/**",
    "package.json",
    "bun.lock",
    "vite.config.ts",
    "tsconfig.json",
    ".dockerignore",
  ];

  const api = service("api", {
    source,
    replicas,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/api/Dockerfile",
      watchPatterns: ["apps/api/**", "infra/railway/railway.ts", ...sharedInputs],
    },
    preDeploy: "bun run --cwd packages/database migrate",
    healthcheck: deploymentServices.api.ready,
    healthcheckTimeout: 180,
    deploy: { ...deployment, preDeployTimeoutSeconds: 180 },
  });
  const web = service("web", {
    source,
    replicas,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: ["apps/web/**", "infra/railway/railway.ts", ...sharedInputs],
    },
    healthcheck: deploymentServices.web.health,
    healthcheckTimeout: 180,
    deploy: deployment,
  });
  const relay = service("relay", {
    source,
    replicas,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "infra/relay/Dockerfile",
      watchPatterns: ["infra/relay/**", "infra/railway/railway.ts", ...sharedInputs],
    },
    healthcheck: deploymentServices.relay.ready,
    healthcheckTimeout: 180,
    deploy: deployment,
  });
  const gateway = service("gateway", {
    source,
    replicas,
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "infra/railway/Dockerfile",
      watchPatterns: [
        "infra/railway/Dockerfile",
        "infra/railway/Caddyfile",
        "infra/railway/railway.ts",
        ".dockerignore",
      ],
    },
    healthcheck: deploymentServices.gateway.ready,
    healthcheckTimeout: 180,
    deploy: deployment,
  });

  // CLI supports this variable policy; SDK 3.16 omits it from ProjectDefinition.
  const configuration = {
    // Runtime secrets and origin references are managed through Railway variables.
    variables: { managed: false },
    resources: [api, web, relay, gateway],
  };
  return project("raypx", configuration);
});
