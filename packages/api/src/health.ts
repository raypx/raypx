import type { HealthResponse, ReadinessResponse } from "@raypx/contracts/health";
import { errorResponse, HttpError } from "./http.js";
import type { RuntimeLifecycle } from "./runtime.js";

/** Lightweight liveness probe; it does not connect unused dependencies. */
export function healthResponse(): Response {
  return Response.json({ status: "ok", service: "raypx-api" } satisfies HealthResponse);
}

/** Reports initialization and the health of registered required dependencies. */
export async function readinessResponse(runtime: RuntimeLifecycle): Promise<Response> {
  const result = await runtime.checkReadiness();
  return Response.json({ ...result, service: "raypx-api" } satisfies ReadinessResponse, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}

/** Unknown API routes use the same public error contract as business failures. */
export function apiNotFoundResponse(): Response {
  return errorResponse(new HttpError("NOT_FOUND"));
}
