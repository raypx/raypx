import { z } from "zod";
import type { AgentTask, HumanRequest } from "./tasks.ts";

export const agentRunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_approval",
  "waiting_input",
  "waiting_host",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "uncertain",
]);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export class AgentRunProjectionError extends Error {
  readonly code = "INVALID_AGENT_RUN_PROJECTION";

  constructor(readonly taskStatus: AgentTask["status"]) {
    super(`Cannot project a ${taskStatus} task without its pending request kind.`);
    this.name = "AgentRunProjectionError";
  }
}

/** A read-only projection; AgentTask remains the persisted lifecycle source. */
export function projectTaskStatusToRunStatus(
  task: Pick<AgentTask, "status">,
  pendingRequestKind?: HumanRequest["kind"],
): AgentRunStatus {
  switch (task.status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "waiting":
      if (!pendingRequestKind) throw new AgentRunProjectionError(task.status);
      return pendingRequestKind === "question" ? "waiting_input" : "waiting_approval";
    case "cancelling":
      return "cancelling";
    case "succeeded":
      return "succeeded";
    case "failed":
    case "delivery_failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
  }
}
