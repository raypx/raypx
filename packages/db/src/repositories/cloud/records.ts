import type { CloudEntities, CloudEntityKind } from "@raypx/core";

export const cloudRecords = {
  mutations: { table: "cloud_mutations", parents: [] },
  conversations: { table: "cloud_conversations", parents: [] },
  turns: { table: "cloud_turns", parents: ["conversationId", "runId"] },
  tasks: { table: "cloud_tasks", parents: ["conversationId"] },
  rounds: { table: "cloud_task_rounds", parents: ["taskId"] },
  spendingGrants: { table: "cloud_spending_grants", parents: [] },
  messages: { table: "cloud_messages", parents: ["runId"] },
  executionGrants: { table: "cloud_execution_grants", parents: ["runId"] },
  runs: { table: "cloud_runs", parents: ["conversationId", "taskId"] },
  executions: { table: "cloud_executions", parents: ["runId"] },
  tools: { table: "cloud_tools", parents: ["runId"] },
  sources: { table: "cloud_sources", parents: ["runId"] },
  assets: { table: "cloud_assets", parents: ["runId"] },
  revisions: { table: "cloud_revisions", parents: ["taskId", "runId"] },
  usage: { table: "cloud_usage_calls", parents: ["runId"] },
  commands: { table: "cloud_commands", parents: ["runId"] },
} satisfies Record<CloudEntityKind, { table: string; parents: readonly string[] }>;

export function cloudParentIds(
  kind: CloudEntityKind,
  value: CloudEntities[CloudEntityKind],
): string[] {
  const entity = value as unknown as Record<string, unknown>;
  return cloudRecords[kind].parents
    .map((key) => entity[key])
    .filter((value): value is string => typeof value === "string");
}

export function cloudActorId(
  kind: CloudEntityKind,
  value: CloudEntities[CloudEntityKind],
): string | null {
  const entity = value as unknown as Record<string, unknown>;
  const actor =
    kind === "usage"
      ? typeof entity["accountId"] === "string" && entity["accountId"].startsWith("user:")
        ? entity["accountId"].slice(5)
        : null
      : (entity["actorId"] ?? entity["requestedByUserId"] ?? entity["createdByUserId"]);
  return typeof actor === "string" ? actor : null;
}

const dates = [
  "createdAt",
  "updatedAt",
  "startedAt",
  "completedAt",
  "heartbeatAt",
  "leaseExpiresAt",
  "revokedAt",
  "expiresAt",
  "settledAt",
  "verifiedAt",
  "occurredAt",
];

function restoreDates(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  for (const field of dates)
    if (typeof record[field] === "string") record[field] = new Date(record[field]);
  return record;
}

export function hydrateCloudRecord<T>(data: unknown): T {
  const record = restoreDates(data) as Record<string, unknown>;
  // Mutation replay contains domain DTOs; tool bodies and event payloads stay JSON.
  if (record && typeof record === "object" && "response" in record) {
    const response = restoreDates(record["response"]);
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const projected = response as Record<string, unknown>;
      for (const key of ["task", "round", "run", "turn"])
        if (projected[key]) projected[key] = restoreDates(projected[key]);
    }
    record["response"] = response;
  }
  return record as T;
}
