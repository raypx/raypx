/** Pending reads use account quotas with a one-minute server window. */
export const PENDING_READ_COOLDOWN_MS = 60_000;

export function isRpcRateLimited(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const response = error as { code?: unknown; status?: unknown };
  return response.status === 429 || response.code === "TOO_MANY_REQUESTS";
}
