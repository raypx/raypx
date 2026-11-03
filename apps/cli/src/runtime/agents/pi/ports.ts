import type { TaskContinuation, TaskFollowUp } from "@raypx/core/tasks";
import type { SessionFactory } from "@raypx/provider-core";
import type { LocalAgentTask } from "../model";

export interface PreparedPiSession {
  factory: SessionFactory;
  dispose: () => void;
}

export interface PiExecutionServices {
  available(): Promise<boolean>;
  inspect(local: LocalAgentTask): TaskContinuation | undefined;
  prepare(
    local: LocalAgentTask,
    parent?: LocalAgentTask,
    follow?: TaskFollowUp,
  ): Promise<PreparedPiSession>;
}
