/** Public deployment metadata only; application runtime configuration stays in API. */
export const deploymentServices = {
  api: { port: 3002, health: "/health", ready: "/ready" },
  relay: { port: 3002, health: "/health", ready: "/ready" },
  web: { port: 3000, health: "/health", ready: "/health" },
  gateway: { port: 8080, ready: "/ready" },
} as const;

/** One API namespace and a closed set of protocol/probe root exceptions (ADR 0068). */
export const apiIngress = {
  prefix: "/api/",
  exceptions: [
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
    deploymentServices.api.health,
    deploymentServices.api.ready,
  ],
} as const;

export const relayIngress = { paths: ["/api/device/connect"] } as const;
