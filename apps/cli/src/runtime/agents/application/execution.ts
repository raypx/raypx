import type {
  AgentTask,
  AgentEvent,
  TaskInput,
  TaskFollowUp,
  AgentProvider,
} from "@raypx/core/tasks";
import { TaskContextError, activeTaskStatuses } from "@raypx/core/tasks";
import { taskText } from "@raypx/core/task-text";
import type { TaskChange } from "@raypx/contracts/tasks";
import type { TokenTotals } from "@raypx/provider-core";
import type { LocalAgentTask } from "../model";
import { isDesktopBinding } from "../model";
import type { ExecutionStore } from "../harness/ports";
import { cryptoIds, systemClock, type Clock, type Ids } from "../domain/ports";
import type { Effect, LiveFacts } from "../domain/commands";
import { ManagedExecution, initialExecutionPrompt, executionSession } from "../harness/execution";
import { ConversationRecorder } from "../activity";
import { LocalError } from "../../errors";
import type { ProviderRegistry } from "./providers";
import { ProviderEventIngestor } from "./ingest";

export interface ExecutionRepository extends ExecutionStore {
  settleEffect(id: string, status: "done" | "failed"): void;
  event(binding: string, event: AgentEvent): void;
  seen(id: string): boolean;
  accept(value: LocalAgentTask, commandId: string): void;
  transition(value: LocalAgentTask, event: AgentEvent, inputCode?: TaskInput["code"]): void;
  recordTokenUsage(value: LocalAgentTask, totals: TokenTotals): void;
}
export interface ExecutionProjects {
  find(id: string, provider: AgentProvider): string | undefined;
  canonical(path: string): string;
  lockKey(directory: string): Promise<string>;
  acquire(key: string): (() => void) | null;
}
export interface ApprovalEndpoints {
  endpoint(id: string): { url: string; token: string };
  forget(id: string): void;
  close(): Promise<void>;
}
export interface ExecutionOptions {
  assertInstance?: (() => Promise<void>) | undefined;
  environment?: (() => Record<string, string | undefined>) | undefined;
  interruptTimeoutMs?: number | undefined;
  /** Determinism ports; production uses the wall clock and random UUIDs. */
  clock?: Clock | undefined;
  ids?: Ids | undefined;
}
/** One owner for active handles, startup fences, drain and project locks. */
export class ExecutionCoordinator {
  private readonly active = new Map<string, ManagedExecution>();
  private readonly bindingVersions = new Map<string, number>();
  private closing = false;
  private readonly completions = new Set<Promise<void>>();
  private readonly cancelledStarts = new Set<string>();
  constructor(
    private readonly store: ExecutionRepository,
    private readonly providers: ProviderRegistry,
    private readonly projects: ExecutionProjects,
    private readonly hooks: ApprovalEndpoints,
    private readonly changed: (pendingRequest?: string, change?: TaskChange) => void,
    private readonly options: ExecutionOptions,
  ) {}
  private get clock() {
    return this.options.clock ?? systemClock;
  }
  private get ids() {
    return this.options.ids ?? cryptoIds;
  }
  get(id: string) {
    return this.active.get(id);
  }
  has(id: string) {
    return this.active.has(id);
  }
  isClosing() {
    return this.closing;
  }
  async cancelTask(local: LocalAgentTask, starting?: Promise<unknown>) {
    if (!activeTaskStatuses.includes(local.task.status)) return;
    this.cancelledStarts.add(local.task.id);
    const execution = this.active.get(local.task.id);
    if (execution) {
      this.status(local, "cancelling");
      execution.cancel();
      await Promise.allSettled(this.completions);
    } else {
      await starting;
      if (activeTaskStatuses.includes(local.task.status)) this.status(local, "cancelled");
    }
    this.cancelledStarts.delete(local.task.id);
  }
  private emit(local: LocalAgentTask, event: AgentEvent) {
    this.store.event(local.binding, event);
    this.changedFor(local, event);
  }
  private changedFor(local: LocalAgentTask, event: AgentEvent) {
    this.changed(undefined, {
      type: "events",
      local: isDesktopBinding(local.binding),
      deviceId: local.task.deviceId,
      events: [{ sequence: 1, event }],
    });
  }
  status(
    local: LocalAgentTask,
    status: AgentTask["status"],
    summary = "",
    inputCode?: TaskInput["code"],
  ) {
    const task = {
      ...local.task,
      status,
      summary: taskText(summary, 32_000),
      updatedAt: this.clock.now().toISOString(),
    };
    const event: AgentEvent = {
      id: this.ids.generate(),
      taskId: task.id,
      kind: "status",
      status,
      summary: task.summary,
      task,
    };
    this.store.transition(
      { ...local, task },
      event,
      inputCode ?? (summary === "INPUT_DELIVERY_FAILED" ? "INPUT_DELIVERY_FAILED" : "TASK_STOPPED"),
    );
    Object.assign(local.task, task);
    this.changedFor(local, event);
  }
  async start(
    binding: string,
    commandId: string,
    task: AgentTask,
    deadline: string,
    follow?: TaskFollowUp,
  ) {
    this.providers.assertScope(task.provider, binding);
    const version = this.bindingVersions.get(binding) ?? 0;
    if (this.options.assertInstance) await this.options.assertInstance();
    if (this.store.seen(commandId)) return { accepted: true };
    if (this.closing) throw new LocalError("CLOSING", "Agent host is closing");
    const local: LocalAgentTask = { task: { ...task }, binding, sessionId: null };
    const parent = task.parentTaskId ? this.store.get(task.parentTaskId) : undefined;
    initialExecutionPrompt(task, undefined, Boolean(executionSession(local, parent)));
    // Persist the receipt before spawning. An ambiguous crash is interrupted, never replayed.
    this.store.accept(local, commandId);
    if (
      !Number.isFinite(Date.parse(deadline)) ||
      Date.parse(deadline) <= this.clock.now().getTime()
    ) {
      this.status(local, "delivery_failed");
      return { accepted: true };
    }
    const root = this.projects.find(task.projectId, task.provider);
    const capability = (await this.providers.discover()).find(
      (item) => item.provider === task.provider,
    );
    if (
      !capability?.available ||
      !capability.definition.modes.includes(task.mode) ||
      (task.model !== undefined && !capability.definition.modelSelection)
    ) {
      this.status(local, "failed", "UNSUPPORTED_CAPABILITY");
      return { accepted: true };
    }
    if (!root) {
      this.status(local, "failed", "AGENT_UNAVAILABLE");
      return { accepted: true };
    }
    let directory: string;
    try {
      directory = this.projects.canonical(root);
    } catch {
      this.status(local, "failed", "PROJECT_UNAVAILABLE");
      return { accepted: true };
    }
    const lockName = await this.projects.lockKey(directory);
    if (
      this.closing ||
      version !== (this.bindingVersions.get(binding) ?? 0) ||
      this.cancelledStarts.has(task.id)
    ) {
      this.status(local, "cancelled");
      return { accepted: true };
    }
    const unlock = this.projects.acquire(lockName);
    if (!unlock) {
      this.status(local, "failed", "PROJECT_BUSY");
      return { accepted: true };
    }
    let factory: import("@raypx/provider-core").SessionFactory;
    let dispose: (() => void) | undefined;
    try {
      const prepared = await this.providers.prepare(local, parent, follow);
      factory = prepared.factory;
      dispose = prepared.dispose;
      this.store.put(local);
    } catch (error) {
      dispose?.();
      unlock();
      this.status(local, "failed", error instanceof LocalError ? error.code : "AI_INVALID_CONFIG");
      return { accepted: true };
    }
    if (
      this.closing ||
      version !== (this.bindingVersions.get(binding) ?? 0) ||
      this.cancelledStarts.has(task.id)
    ) {
      dispose?.();
      unlock();
      this.status(local, "cancelled");
      return { accepted: true };
    }
    // Provider and recorder reports reach storage only through the ingestor.
    const ingest = new ProviderEventIngestor(this.store, local, this.ids, (event) =>
      this.changedFor(local, event),
    );
    const execution = new ManagedExecution(
      local,
      new ConversationRecorder(
        task.id,
        (entry) => ingest.activity(entry),
        isDesktopBinding(binding) ? 250 : 1000,
        (totals) => ingest.usage(totals),
        this.clock,
        this.ids,
      ),
      unlock,
      this.store,
      {
        status: (status, summary) => this.status(local, status, summary),
        changed: (pendingRequest) => this.changed(pendingRequest),
        resolved: (requestId) =>
          this.emit(local, {
            id: this.ids.generate(),
            taskId: local.task.id,
            kind: "resolved",
            requestId,
          }),
        hook: () => this.hooks.endpoint(task.id),
        environment: () => this.options.environment?.() ?? process.env,
        track: (completion) => {
          this.completions.add(completion);
          void completion.finally(() => this.completions.delete(completion));
        },
        ended: () => {
          dispose?.();
          this.hooks.forget(task.id);
          this.active.delete(task.id);
        },
      },
      factory,
      this.options.interruptTimeoutMs,
      this.clock,
      this.ids,
      ingest,
    );
    this.active.set(task.id, execution);
    this.status(local, "running");
    void execution
      .run(directory)
      .catch((error: unknown) =>
        execution.finish(
          "failed",
          error instanceof TaskContextError ||
            (error instanceof LocalError && error.code === "SESSION_UNAVAILABLE")
            ? error.code
            : "AGENT_PROTOCOL_FAILED",
        ),
      );
    return { accepted: true };
  }
  /** Live process facts the decider reads; it never touches a handle itself. */
  live(): LiveFacts {
    return {
      closing: this.closing,
      active: (taskId) => this.active.has(taskId),
      pending: (taskId, requestId) => this.active.get(taskId)?.hasPending(requestId) ?? false,
      ready: (taskId) => this.active.has(taskId),
      queueLength: () => 0,
    };
  }
  /**
   * The effect worker. Each effect runs after the commit that produced it, and is
   * never retried: the provider process it addresses does not survive a restart.
   */
  runEffects(effects: readonly (Effect & { effectId?: string })[]) {
    for (const effect of effects) {
      let ran = false;
      if (effect.type === "provider.request.respond")
        ran = this.active.get(effect.taskId)?.respond(effect.requestId, effect.decision) ?? false;
      else if (effect.type === "execution.cancel") {
        const execution = this.active.get(effect.taskId);
        execution?.cancel();
        ran = Boolean(execution);
      }
      // A missing handle means the process is gone; the effect cannot be delivered.
      if (effect.effectId) this.store.settleEffect(effect.effectId, ran ? "done" : "failed");
    }
  }
  async detach(binding: string) {
    this.bindingVersions.set(binding, (this.bindingVersions.get(binding) ?? 0) + 1);
    for (const execution of this.active.values())
      if (execution.local.binding === binding) execution.cancel();
    await Promise.allSettled(this.completions);
    return { detached: true };
  }
  async close() {
    this.closing = true;
    const executions = [...this.active.values()];
    for (const execution of executions) execution.cancel();
    await Promise.allSettled(this.completions);
    await this.hooks.close();
  }
}
