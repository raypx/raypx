import type { TaskContinuation } from "@raypx/core/tasks";
import type { RelayRequest } from "@raypx/contracts/tasks";
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
    follow?: Extract<RelayRequest, { method: "tasks.followUp" }>["input"],
  ): Promise<PreparedPiSession>;
}
