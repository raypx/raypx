import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";
import { requestJson } from "./http.js";

export interface HealthCheckOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function checkHealth({
  signal,
  timeoutMs = 5000,
}: HealthCheckOptions = {}): Promise<HealthResponse> {
  return requestJson({
    path: "/api/health",
    schema: healthResponseSchema,
    signal,
    timeoutMs,
  });
}
