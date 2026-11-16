/** Runtime counterpart of the build-only ingress contract; checked on every role. */
export const apiRootExceptions = [
  "/.well-known/openid-configuration",
  "/.well-known/oauth-authorization-server",
  "/health",
  "/ready",
] as const;

/** Also runs in the production artifact: an undeclared root mount fails startup. */
export function assertApiIngress(routes: readonly { method: string; path: string }[]) {
  for (const { method, path } of routes) {
    // Hono records global middleware alongside endpoints.
    if (method === "ALL" && path === "/*") continue;
    if (path.startsWith("/api/") || apiRootExceptions.some((entry) => entry === path)) continue;
    throw new Error(`API route outside its ingress namespace: ${method} ${path}`);
  }
}
