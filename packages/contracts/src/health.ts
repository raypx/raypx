import { z } from "zod";

/**
 * Health check response Zod schema
 *
 * Validates /api/health endpoint return value
 *
 * @example
 * ```typescript
 * const response = healthResponseSchema.parse({
 *   status: "ok",
 *   service: "raypx-api"
 * });
 * ```
 */
export const healthResponseSchema = z.object({
  /** Service status, fixed as "ok" */
  status: z.literal("ok"),
  /** Service name, fixed as "raypx-api" */
  service: z.literal("raypx-api"),
});

/**
 * Health check response type
 *
 * TypeScript type inferred from healthResponseSchema
 * Used for server function return type annotation
 *
 * @example
 * ```typescript
 * export function healthResponse() {
 *   return Response.json({
 *     status: "ok",
 *     service: "raypx-api"
 *   } satisfies HealthResponse);
 * }
 * ```
 */
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Dependency readiness probe. A failed probe returns this contract with HTTP 503. */
export const readinessResponseSchema = z.strictObject({
  status: z.enum(["ok", "unavailable"]),
  service: z.literal("raypx-api"),
  checks: z.record(z.string(), z.enum(["ok", "failed"])),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
