/** Public deployment metadata only; application runtime configuration stays in API. */
export const deploymentServices = {
  api: { port: 3002, health: "/health", ready: "/ready" },
  relay: { port: 3002, health: "/health", ready: "/ready" },
  web: { port: 3000, health: "/health", ready: "/health" },
  gateway: { port: 8080, ready: "/ready" },
} as const;

/** API-owned paths on a shared Web/API origin; static proxies must match exactly. */
export const apiIngress = {
  prefixes: ["/api/", "/rpc/", "/routines/", "/device/", "/page-content/", "/message-attachments/"],
  paths: [
    "/.well-known/openid-configuration",
    "/.well-known/oauth-authorization-server",
    "/events",
    deploymentServices.api.health,
    deploymentServices.api.ready,
  ],
} as const;

export const relayIngress = { paths: ["/device/connect"] } as const;
