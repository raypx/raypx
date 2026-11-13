import type {
  AgentEvent,
  AgentTask,
  HumanRequest,
  TaskActivity,
  TaskContinuation,
} from "@raypx/core/tasks";
import { projectTaskStatusToRunStatus } from "@raypx/core/agent-runs";
import type { LocalAgentTask } from "../model.js";
import { desktopBinding } from "../model.js";
import { LocalError } from "../../errors.js";
import { bounded } from "../projection.js";
export interface AgentReadRepository {
  get(id: string): LocalAgentTask | undefined;
  requests(binding: string, id?: string): HumanRequest[];
  pendingRequests(binding: string): HumanRequest[];
  taskPage(
    binding: string,
    limit: number,
    before?: string,
    projectId?: string,
    deviceId?: string,
  ): AgentTask[];
  taskEvents(binding: string, id: string, after: number): { cursor: number; event: AgentEvent }[];
  activityPage(
    binding: string,
    id: string,
    before?: number,
  ): { activity: TaskActivity[]; activityBefore?: number };
}
export class AgentQueries {
  constructor(
    private readonly store: AgentReadRepository,
    private readonly inspect: (local: LocalAgentTask) => TaskContinuation | undefined,
  ) {}
  localTasks(
    accountId: string,
    limit: number,
    before?: string,
    projectId?: string,
    deviceId?: string,
  ) {
    return bounded(
      this.store.taskPage(desktopBinding(accountId), limit, before, projectId, deviceId),
    );
  }
  localTask(accountId: string, id: string, after: number, beforeActivity?: number) {
    const binding = desktopBinding(accountId),
      local = this.store.get(id);
    if (!local || local.binding !== binding) throw new LocalError("NOT_FOUND", "Task unavailable");
    const requests = this.store.requests(binding, id).reverse();
    let pendingKind: HumanRequest["kind"] | undefined;
    if (local.task.status === "waiting") {
      const kinds = new Set(
        requests
          .filter((request) => request.status === "pending" || request.status === "decided")
          .map((request) => request.kind),
      );
      if (kinds.size !== 1)
        throw new LocalError(
          "INVALID_AGENT_RUN_PROJECTION",
          "Waiting task has no unambiguous pending request kind",
        );
      pendingKind = [...kinds][0];
    }
    const continuation = this.inspect(local);
    return {
      task: local.task,
      ...(local.review ? { review: local.review } : {}),
      ...(continuation ? { continuation } : {}),
      runStatus: projectTaskStatusToRunStatus(local.task, pendingKind),
      ...this.store.activityPage(binding, id, beforeActivity),
      events: bounded(this.store.taskEvents(binding, id, after)),
      requests: bounded(requests, true),
    };
  }
  localApprovals(accountId: string) {
    const binding = desktopBinding(accountId);
    return bounded(this.store.pendingRequests(binding), true);
  }
}
