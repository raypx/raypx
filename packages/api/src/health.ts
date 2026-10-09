import type { HealthResponse } from "@raypx/contracts/health";

/**
 * Health check endpoint handler
 *
 * Returns server status information for monitoring and load balancer probing
 *
 * @returns JSON response containing status and service fields
 *
 * @example
 * ```typescript
 * // Use in route
 * export const Route = createFileRoute("/api/health")({
 *   server: { handlers: { GET: healthResponse } },
 * });
 * ```
 */
export function healthResponse(): Response {
  return Response.json({ status: "ok", service: "raypx-api" } satisfies HealthResponse);
}

/**
 * API 404 handler
 *
 * Catches unmatched /api/* paths, returns standardized JSON error response
 *
 * @returns JSON error response with status 404
 *
 * @example
 * ```typescript
 * // Use in wildcard route
 * export const Route = createFileRoute("/api/$")({
 *   server: { handlers: { GET: apiNotFoundResponse } },
 * });
 * ```
 */
export function apiNotFoundResponse(): Response {
  return Response.json({ error: "Not found" }, { status: 404 });
}
