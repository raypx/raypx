import type { HumanRequest, TaskContinuation, TaskFollowUp } from "@raypx/core/tasks";
import type { SessionFactory } from "@raypx/providers/core";
import type { LocalAgentTask } from "../model.js";

export interface PreparedPiSession {
  factory: SessionFactory;
  dispose: () => void;
}

export interface PiExecutionServices {
  approvalId?(local: LocalAgentTask): string | undefined;
  restore?(local: LocalAgentTask, approval: HumanRequest): Promise<PreparedPiSession>;
  available(): Promise<boolean>;
  inspect(local: LocalAgentTask): TaskContinuation | undefined;
  prepare(
    local: LocalAgentTask,
    parent?: LocalAgentTask,
    follow?: TaskFollowUp,
  ): Promise<PreparedPiSession>;
}
