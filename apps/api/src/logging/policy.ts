import type { EventPolicyOptions } from "@raypx/logger/safe";

/** API-owned policy; new application fields require an explicit runtime allowlist. */
const API_LOG_FIELDS = [
  "operation",
  "runId",
  "requestId",
  "method",
  "route",
  "status",
  "code",
  "durationMs",
  "waitBeforeCreationMs",
  "waitBeforeStartMs",
  "firstResponseMs",
  "totalMs",
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
      "oauthTokens",
      "rateLimits",
      "contextReceipts",
      "claimed",
      "reconciled",
      "failed",
    ],
  },
} satisfies EventPolicyOptions;
