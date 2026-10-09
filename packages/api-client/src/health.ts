import { healthResponseSchema, type HealthResponse } from "@raypx/contracts/health";

export interface HealthCheckOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function checkHealth({
  signal,
  timeoutMs = 5000,
}: HealthCheckOptions = {}): Promise<HealthResponse> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch("/api/health", {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return healthResponseSchema.parse(await response.json());
}
