import { DomainError } from "@voidmix/shared";
import type { ProjectResource, NewRecord } from "../resources.js";
export const agentRunStatusesV2 = [
  "queued",
  "running",
  "waiting_for_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatusV2 = (typeof agentRunStatusesV2)[number];

export interface AgentRunV2 extends ProjectResource {
  requestedByUserId: string;
  assetVersionId: string | null;
  status: AgentRunStatusV2;
  attempt: number;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
}

export interface AgentRunV2Repository {
  getById(id: string): Promise<AgentRunV2 | null>;
  /** Implementations should insert the run and dispatch event atomically. */
  createQueued?(input: NewRecord<AgentRunV2, "status" | "output" | "error">): Promise<AgentRunV2>;
  create(input: NewRecord<AgentRunV2, "status" | "output" | "error">): Promise<AgentRunV2>;
  updateStatus(input: {
    id: string;
    status: AgentRunStatusV2;
    output?: Record<string, unknown> | null;
    error?: string | null;
    now: Date;
  }): Promise<AgentRunV2 | null>;
}

type AgentRunErrorCode = "AGENT_RUN_INVALID_INPUT" | "AGENT_RUN_TERMINAL";
export class AgentRunV2DomainError extends DomainError<AgentRunErrorCode> {
  constructor(code: AgentRunErrorCode, message: string) {
    super(code, message);
    this.name = "AgentRunV2DomainError";
  }
}

export function assertAgentRunCanCancelV2(status: AgentRunStatusV2): void {
  if (status === "succeeded" || status === "failed" || status === "cancelled") {
    throw new AgentRunV2DomainError(
      "AGENT_RUN_TERMINAL",
      "A terminal Agent run cannot be cancelled.",
    );
  }
}
