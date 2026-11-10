import {
  activeTaskStatuses,
  TaskContextError,
  type AgentTask,
  type TaskCommand,
  type TaskContextSelection,
  type TaskContextTarget,
  type TaskContextSnapshot,
  type TaskFollowUp,
  type HumanRequest,
  type TaskActivity,
  type HumanDecision,
  type TaskInput,
} from "@raypx/core/tasks";
import { ContextError } from "@raypx/memory/model";
import { LocalError } from "../../errors.ts";
import { desktopBinding, type LocalAgentTask } from "../model.ts";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { systemClock, type Clock } from "../domain/ports.ts";
import { DecisionRejected } from "../domain/decider.ts";

export interface CommandEnvelope {
  id: string;
  deviceId: string;
  request: TaskCommand;
  expiresAt: string;
  context?: TaskContextSnapshot | undefined;
}
export type CommandResult = { ok: true; value: unknown } | { ok: false; code: string };
export interface AgentCommandRepository {
  reserve(binding: string, command: CommandEnvelope): CommandResult | null;
  complete(id: string, result: CommandResult): void;
  get(id: string): LocalAgentTask | undefined;
  activity(binding: string, id: string): TaskActivity[];
  getRequest(binding: string, id: string): HumanRequest | undefined;
  request(binding: string, value: HumanRequest): undefined;
}
export interface CommandExecutionPort {
  get(id: string): { hasPending(id: string): boolean } | undefined;
  start(
    binding: string,
    commandId: string,
    task: AgentTask,
    deadline: string,
    follow?: TaskFollowUp,
  ): Promise<{ accepted: boolean }>;
  input(id: string, input: Extract<TaskCommand, { method: "tasks.input" }>["input"]): TaskInput;
  cancel(local: LocalAgentTask, starting?: Promise<CommandResult>): Promise<void>;
  decide(
    binding: string,
    commandId: string,
    taskId: string,
    requestId: string,
    decision: HumanDecision,
  ): Promise<unknown>;
}
export interface ResolveContext {
  (
    selection: TaskContextSelection,
    target: TaskContextTarget,
    prompt: string,
  ): Promise<TaskContextSnapshot>;
}
export class AgentCommandService {
  private readonly remoteCommands = new Map<string, Promise<CommandResult>>();
  constructor(
    private readonly store: AgentCommandRepository,
    private readonly execution: CommandExecutionPort,
    private readonly isClosing: () => boolean,
    private readonly resolveContext?: ResolveContext,
    private readonly clock: Clock = systemClock,
  ) {}
  pendingIds() {
    return new Set(this.remoteCommands.keys());
  }
  async remote(binding: string, command: CommandEnvelope) {
    try {
      const old = this.store.reserve(binding, command);
      if (old) return old;
      const pending = this.remoteCommands.get(command.id);
      if (pending) return pending;
      const operation = this.applyRemote(binding, command).then(
        (value) => ({ ok: true as const, value }),
        (error) => ({
          ok: false as const,
          code:
            error instanceof LocalError ||
            error instanceof TaskContextError ||
            error instanceof ContextError
              ? error.code
              : "AGENT_UNAVAILABLE",
        }),
      );
      this.remoteCommands.set(command.id, operation);
      try {
        const result = await operation;
        this.store.complete(command.id, result);
        return result;
      } finally {
        this.remoteCommands.delete(command.id);
      }
    } catch (error) {
      return {
        ok: false as const,
        code:
          error instanceof LocalError ||
          error instanceof TaskContextError ||
          error instanceof ContextError
            ? error.code
            : "AGENT_UNAVAILABLE",
      };
    }
  }
  private async applyRemote(binding: string, command: CommandEnvelope) {
    if (this.isClosing()) throw new LocalError("CLOSING", "Agent host is closing");
    const getTask = (id: string) => {
      const local = this.store.get(id);
      if (!local || local.binding !== binding || local.task.deviceId !== command.deviceId)
        throw new LocalError("NOT_FOUND", "Task unavailable");
      return local;
    };
    const request = command.request;
    if (
      (request.method === "tasks.create" ||
        request.method === "tasks.followUp" ||
        request.method === "tasks.input") &&
      request.input.id !== command.id
    )
      throw new LocalError("IDEMPOTENCY_CONFLICT", "Command identity changed");
    if (request.method === "tasks.input") {
      const local = getTask(request.input.taskId);
      const old = this.store
        .activity(binding, local.task.id)
        .find((entry) => entry.id === request.input.id);
      // A recorded receipt is never redispatched, including after a host restart.
      if (old?.kind === "input") return old;
      if (old) throw new LocalError("IDEMPOTENCY_CONFLICT", "Input identity changed");
    }
    if (request.method === "tasks.create" || request.method === "tasks.followUp") {
      const existing = this.store.get(request.input.id);
      if (existing) {
        getTask(existing.task.id);
        return existing.task;
      }
    }
    if (Date.parse(command.expiresAt) <= this.clock.now().getTime())
      throw new LocalError("DELIVERY_EXPIRED", "Command expired");
    if (request.method === "tasks.create" || request.method === "tasks.followUp") {
      const requestInput = request.input;
      let task: AgentTask;
      const now = this.clock.now().toISOString();
      if (request.method === "tasks.create") {
        const { contextSelection, ...input } = request.input;
        let context = command.context;
        if (!context && contextSelection?.sources.length) {
          if (binding !== desktopBinding(LOCAL_WORKSPACE_ID) || !this.resolveContext)
            throw new ContextError("CONTEXT_UNAVAILABLE");
          context = await this.resolveContext(
            contextSelection,
            {
              deviceId: input.deviceId,
              projectId: input.projectId,
            },
            input.prompt,
          );
        }
        task = {
          ...input,
          ...(context ? { context } : {}),
          parentTaskId: null,
          status: "pending",
          summary: "",
          createdAt: now,
          updatedAt: now,
        };
      } else {
        const parent = getTask(request.input.parentTaskId);
        if (activeTaskStatuses.includes(parent.task.status))
          throw new LocalError("PROJECT_BUSY", "Parent task is still active");
        task = {
          ...parent.task,
          id: requestInput.id,
          parentTaskId: parent.task.id,
          prompt: requestInput.prompt,
          ...(request.input.model ? { model: request.input.model } : {}),
          mode: "run",
          status: "pending",
          summary: "",
          createdAt: now,
          updatedAt: now,
        };
      }
      await this.execution.start(
        binding,
        command.id,
        task,
        command.expiresAt,
        request.method === "tasks.followUp" ? request.input : undefined,
      );
      return getTask(task.id).task;
    }
    if (request.method === "tasks.input") {
      const local = getTask(request.input.taskId);
      return this.execution.input(local.task.id, request.input);
    }
    if (request.method === "tasks.cancel") {
      const local = getTask(request.input.id);
      await this.execution.cancel(local, this.remoteCommands.get(local.task.id));
      return getTask(local.task.id).task;
    }
    // A thin shell: binding ownership is checked here, the decider owns the rest.
    const requestValue = this.store.getRequest(binding, request.input.id);
    if (!requestValue) throw new LocalError("NOT_FOUND", "Request unavailable");
    const local = getTask(requestValue.taskId);
    try {
      await this.execution.decide(
        binding,
        command.id,
        local.task.id,
        requestValue.id,
        request.input.decision,
      );
    } catch (error) {
      if (error instanceof DecisionRejected) throw new LocalError(error.code, error.message);
      throw error;
    }
    return this.store.getRequest(binding, requestValue.id)!;
  }
}
