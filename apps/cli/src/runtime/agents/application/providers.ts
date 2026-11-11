import type {
  AgentCapability,
  AgentProvider,
  TaskContinuation,
  TaskFollowUp,
} from "@raypx/core/tasks";
import type { SessionFactory } from "@raypx/providers/core";
import type { LocalAgentTask } from "../model.js";
import { LocalError } from "../../errors.js";
import { desktopBinding } from "../model.js";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

interface PreparedSession {
  factory: SessionFactory;
  dispose(this: void): void;
}
export interface ProviderDriver {
  provider: AgentProvider;
  remote: boolean;
  discover(): Promise<AgentCapability>;
  inspect?(local: LocalAgentTask): TaskContinuation | undefined;
  prepare(
    local: LocalAgentTask,
    parent?: LocalAgentTask,
    follow?: TaskFollowUp,
  ): Promise<PreparedSession>;
}
export class ProviderRegistry {
  constructor(private readonly drivers: readonly ProviderDriver[]) {}
  private driver(provider: AgentProvider) {
    const driver = this.drivers.find((entry) => entry.provider === provider);
    if (!driver) throw new LocalError("AGENT_UNAVAILABLE", "Provider unavailable");
    return driver;
  }
  discover() {
    return Promise.all(this.drivers.map((driver) => driver.discover()));
  }
  allowsRemote(provider: AgentProvider) {
    return this.driver(provider).remote;
  }
  assertScope(provider: AgentProvider, binding: string) {
    if (!this.allowsRemote(provider) && binding !== desktopBinding(LOCAL_WORKSPACE_ID))
      throw new LocalError(
        "UNSUPPORTED_CAPABILITY",
        "Provider supports device-owned local tasks only",
      );
  }
  inspect(local: LocalAgentTask) {
    return this.driver(local.task.provider).inspect?.(local);
  }
  prepare(local: LocalAgentTask, parent?: LocalAgentTask, follow?: TaskFollowUp) {
    return this.driver(local.task.provider).prepare(local, parent, follow);
  }
}
