import type { EventPolicyOptions } from "@raypx/logger/safe";

/** API-owned policy; new application fields require an explicit runtime allowlist. */
const API_LOG_FIELDS = [
  "operation",
  "requestId",
  "method",
  "route",
  "status",
  "code",
  "durationMs",
  "error",
  "rpc",
  "job",
] as const;
export const apiEventPolicy = {
  fields: API_LOG_FIELDS,
  shapes: {
    rpc: ["system", "method"],
    job: [
      "name",
      "status",
      "sessions",
      "verifications",
      "rateLimits",
      "contextReceipts",
      "claimed",
      "reconciled",
      "failed",
    ],
  },
} satisfies EventPolicyOptions;
