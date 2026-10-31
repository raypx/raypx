/** Public deployment metadata only; application runtime configuration stays in API. */
export const deploymentServices = {
  api: { port: 3002, health: "/health", ready: "/ready" },
  web: { port: 3000, health: "/health", ready: "/health" },
  gateway: { port: 8080, ready: "/ready" },
} as const;

export const apiIngress = {
  prefixes: ["/api/", "/rpc/"],
  paths: ["/relay", deploymentServices.api.health, deploymentServices.api.ready],
} as const;
