import { taskText } from "@raypx/core/task-text";
import {
  taskExecutionPrompt,
  humanRequestSchema,
  type AgentTask,
  type HumanDecision,
  type HumanRequest,
  type TaskInput,
} from "@raypx/core/tasks";
import { LocalError } from "../../errors.ts";
import { isDesktopBinding, type LocalAgentTask } from "../model.ts";
import type {
  ExecutionConversation,
  ExecutionEffects,
  ExecutionIngest,
  ExecutionStore,
} from "./ports.ts";
import { cryptoIds, systemClock, type Clock, type Ids } from "../domain/ports.ts";
import type {
  AdapterEvent,
  ProviderSession,
  ExecutionHandle,
  SessionFactory,
} from "@raypx/providers/core";

export function initialExecutionPrompt(
  task: AgentTask,
  continuationPrompt?: string,
  resumed = false,
) {
  const prompt = taskExecutionPrompt({
    ...(resumed ? {} : task),
    prompt: continuationPrompt ?? task.prompt,
  });
  return (
    prompt +
    (task.mode === "plan"
      ? "\nInspect the project and propose an implementation plan. Do not modify files before the plan is approved."
      : "\nModify and validate only. Do not commit, merge, or push unless separately instructed by the user.")
  );
}

/** A parent id alone never proves the provider conversation can be continued. */
export function executionSession(
  local: LocalAgentTask,
  parent?: LocalAgentTask,
): string | undefined {
  if (local.sessionId) return local.sessionId;
  if (
    parent?.sessionId &&
    local.task.parentTaskId === parent.task.id &&
    parent.binding === local.binding &&
    parent.task.projectId === local.task.projectId &&
    parent.task.provider === local.task.provider
  )
    return parent.sessionId;
  return undefined;
}

type Pending = {
  request: HumanRequest;
  resolve(decision: HumanDecision): void;
  timer: ReturnType<typeof setTimeout>;
};
/** Single owner for turn/input/approval state and the project lock through process draining. */
export class ManagedExecution {
  private process: ExecutionHandle | undefined;
  private adapter: ProviderSession | undefined;
  private readonly pending = new Map<string, Pending>();
  private cancelled = false;
  private finished = false;
  private summary = "";
  private awaitingPlan = false;
  private planRequestHandled = false;
  private inputs: TaskInput[] = [];
  private operation = Promise.resolve();
  private ready = false;
  private turnActive = false;
  private turnVersion = 0;
  private completedTurn = 0;
  private interrupting = false;
  private interruptTimer: ReturnType<typeof setTimeout> | undefined;
  private sendTurn: ((prompt: string) => Promise<void>) | undefined;
  constructor(
    readonly local: LocalAgentTask,
    private readonly conversation: ExecutionConversation,
    private readonly unlock: () => void,
    private readonly store: ExecutionStore,
    private readonly effects: ExecutionEffects,
    private readonly adapterFactory: SessionFactory,
    private readonly interruptTimeoutMs = 10_000,
    private readonly clock: Clock = systemClock,
    private readonly ids: Ids = cryptoIds,
    /** Provider session reports go through the ingestor, not a direct store write. */
    private readonly ingest: ExecutionIngest = {
      session: (sessionId) => {
        this.local.sessionId = sessionId;
        this.store.put(this.local);
      },
    },
  ) {}
  hasPending(id: string) {
    return this.pending.has(id);
  }
  markPlanHandled() {
    this.planRequestHandled = true;
  }
  approveHookPlan() {
    this.local.task.mode = "run";
    this.store.put(this.local);
  }
  /**
   * Commit an applied decision, then answer the provider. A failed commit leaves
   * the request pending and the provider unanswered.
   */
  applyDecision(id: string, decision: HumanDecision) {
    const pending = this.pending.get(id);
    if (pending && Date.parse(pending.request.expiresAt) > this.clock.now().getTime()) {
      this.store.request(this.local.binding, { ...pending.request, status: "applied", decision });
      this.respond(id, decision);
    }
  }
  /**
   * The `provider.request.respond` effect: resolve the adapter's approval promise
   * for a decision whose `request.applied` event has already committed.
   */
  respond(id: string, decision: HumanDecision) {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    pending.resolve(decision);
    this.effects.resolved(id);
    return true;
  }
  enqueue(request: { id: string; mode: TaskInput["mode"]; prompt: string }) {
    if (this.finished || this.cancelled) throw new LocalError("TASK_STOPPED", "Task stopped");
    if (request.mode === "steer" && this.adapter?.input === "queue")
      throw new LocalError("UNSUPPORTED_CAPABILITY", "Provider only supports queued input");
    if (!this.ready) throw new LocalError("TASK_NOT_READY", "Agent is starting");
    if (request.mode === "steer" && (this.pending.size || this.awaitingPlan))
      throw new LocalError("INPUT_WAITING_APPROVAL", "Answer the pending approval first");
    if (this.inputs.length >= 20) throw new LocalError("INPUT_QUEUE_FULL", "Input queue is full");
    if (request.mode === "steer" && this.inputs.some((entry) => entry.mode === "steer"))
      throw new LocalError("INPUT_IN_PROGRESS", "A steer is being delivered");
    const now = this.clock.now().toISOString();
    const entry = this.store.recordActivity(this.local.binding, {
      id: request.id,
      taskId: this.local.task.id,
      kind: "input",
      mode: request.mode,
      text: request.prompt,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    }) as TaskInput;
    if (entry.mode === "steer") this.inputs.unshift(entry);
    else this.inputs.push(entry);
    this.effects.changed();
    if (entry.mode === "steer")
      void this.serial(async () => {
        if (this.pending.size || this.awaitingPlan) {
          this.inputs = this.inputs.filter((input) => input.id !== entry.id);
          this.inputStatus(entry, "failed", "INPUT_DELIVERY_FAILED");
          return;
        }
        if (!this.turnActive) {
          await this.nextInput();
          return;
        }
        const adapter = this.adapter!;
        if (adapter.input === "steer") {
          this.inputStatus(entry, "sending");
          try {
            await adapter.steer(entry.text, this.local.sessionId);
            this.inputs = this.inputs.filter((input) => input.id !== entry.id);
            this.inputStatus(entry, "sent");
          } catch (error) {
            if (error instanceof LocalError && error.code === "AGENT_TURN_CHANGED") {
              entry.mode = "queue";
              this.inputStatus(entry, "queued");
              return;
            }
            this.inputs = this.inputs.filter((input) => input.id !== entry.id);
            this.inputStatus(entry, "failed", "INPUT_DELIVERY_FAILED");
          }
        } else {
          this.inputStatus(entry, "sending");
          this.interrupting = true;
          try {
            await adapter.interrupt();
            if (this.turnActive && !this.finished) {
              clearTimeout(this.interruptTimer);
              const runner = this.process;
              this.interruptTimer = setTimeout(() => {
                if (this.process === runner) this.expireInput(entry);
              }, this.interruptTimeoutMs);
            }
          } catch {
            this.interrupting = false;
            this.inputs = this.inputs.filter((input) => input.id !== entry.id);
            this.inputStatus(entry, "failed", "INPUT_DELIVERY_FAILED");
          }
        }
      });
    return entry;
  }
  private serial(operation: () => Promise<void>) {
    const next = this.operation.then(async () => {
      if (!this.finished) await operation();
    });
    this.operation = next.catch(() => this.finish("failed", "AGENT_PROTOCOL_FAILED"));
    return this.operation;
  }
  private inputStatus(entry: TaskInput, status: TaskInput["status"], code?: TaskInput["code"]) {
    if (this.finished) return;
    Object.assign(
      entry,
      this.store.recordActivity(this.local.binding, {
        ...entry,
        status,
        ...(code ? { code } : {}),
        updatedAt: this.clock.now().toISOString(),
      }),
    );
    this.effects.changed();
  }
  private expireInput(entry: TaskInput) {
    if (
      this.finished ||
      !this.turnActive ||
      !this.interrupting ||
      entry.status !== "sending" ||
      !this.inputs.some((input) => input.id === entry.id)
    )
      return;
    clearTimeout(this.interruptTimer);
    this.interruptTimer = undefined;
    this.inputs = this.inputs.filter((input) => input.id !== entry.id);
    this.inputStatus(entry, "failed", "INPUT_DELIVERY_FAILED");
    this.finish("interrupted", "INPUT_DELIVERY_FAILED");
  }
  private async nextInput() {
    if (this.finished || this.turnActive || !this.sendTurn) return false;
    const entry = this.inputs.shift();
    if (!entry) return false;
    this.inputStatus(entry, "sending");
    try {
      await this.sendTurn(entry.text);
      this.inputStatus(entry, "sent");
    } catch {
      this.inputStatus(entry, "failed", "INPUT_DELIVERY_FAILED");
      this.finish("failed", "AGENT_PROTOCOL_FAILED");
    }
    return true;
  }
  async ask(
    kind: HumanRequest["kind"],
    title: string,
    body: string,
    questions: HumanRequest["questions"] = [],
    deadline?: number,
  ): Promise<HumanDecision> {
    if (this.cancelled || this.finished) return { type: "deny", note: "Task stopped" };
    if (
      body.length > 128_000 ||
      Buffer.byteLength(JSON.stringify({ body, questions })) > 192 * 1024
    )
      return {
        type: "deny",
        note: "Request exceeds remote approval limits. No approval was granted.",
      };
    const now = this.clock.now().getTime();
    const expiresAt = new Date(Math.min(now + 600_000, deadline ?? Infinity)).toISOString();
    const request = humanRequestSchema.parse({
      id: this.ids.generate(),
      taskId: this.local.task.id,
      kind,
      title: taskText(title, 500),
      body: taskText(body, 128_000),
      questions,
      expiresAt,
      status: "pending",
      decision: null,
    });
    this.effects.status("waiting");
    this.store.request(this.local.binding, request);
    const answer = new Promise<HumanDecision>((resolve) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(request.id);
          this.store.request(this.local.binding, { ...request, status: "expired" });
          this.effects.changed();
          resolve({ type: "deny", note: "Request expired" });
        },
        Math.max(1, Date.parse(expiresAt) - this.clock.now().getTime()),
      );
      this.pending.set(request.id, { request, resolve, timer });
    });
    this.effects.changed(isDesktopBinding(this.local.binding) ? request.id : undefined);
    const result = await answer;
    if (!this.cancelled && !this.finished) this.effects.status("running");
    return result;
  }
  async run(directory: string, continuationPrompt?: string) {
    const task = this.local.task;
    const parent = task.parentTaskId ? this.store.get(task.parentTaskId) : undefined;
    const sessionId = executionSession(this.local, parent);
    // SDKs may allocate a session before its first prompt. An id alone does not
    // prove that the frozen task context has already entered the conversation.
    const resumed =
      sessionId !== undefined && (parent !== undefined || continuationPrompt !== undefined);
    if (
      task.parentTaskId &&
      (!sessionId ||
        !parent ||
        parent.binding !== this.local.binding ||
        parent.task.projectId !== task.projectId ||
        parent.task.provider !== task.provider)
    )
      throw new LocalError("SESSION_UNAVAILABLE", "Previous session is unavailable");
    this.planRequestHandled = false;
    const hook = await this.effects.hook();
    if (this.finished || this.cancelled) return;
    const adapter = this.adapterFactory(
      {
        directory,
        mode: task.mode,
        environment: this.effects.environment(),
        ...(sessionId ? { sessionId } : {}),
      },
      {
        approval: { ask: (...args) => this.ask(...args), hook: () => hook },
        current: (handle) => !this.finished && this.process === handle,
        emit: (event) => this.adapterEvent(event, directory, sessionId),
      },
    );
    this.adapter = adapter;
    this.process = adapter.handle;
    if (!adapter.holdPlanOnExit) this.watch(adapter.handle, false);
    const initializedSession = await adapter.initialize(task.mode, sessionId);
    if (initializedSession) {
      if (sessionId && initializedSession !== sessionId)
        throw new LocalError("SESSION_UNAVAILABLE", "Previous session is unavailable");
      this.local.sessionId = initializedSession;
      this.store.put(this.local);
      this.conversation.setTokenBaseline(
        this.store.tokenUsage(initializedSession) ??
          this.local.tokenUsage ??
          (sessionId && parent
            ? parent.tokenUsage
            : { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0 }),
      );
    }
    this.sendTurn = async (prompt) => {
      this.turnVersion++;
      this.turnActive = true;
      this.summary = "";
      this.conversation.startTurn();
      await adapter.sendTurn(prompt, this.local.sessionId, task.mode);
    };
    const start = async () => {
      await this.sendTurn!(initialExecutionPrompt(task, continuationPrompt, resumed));
      this.ready = true;
    };
    // Some adapters replace their process after a plan is approved.
    if (adapter.holdPlanOnExit) {
      await start();
      this.watch(adapter.handle, true);
    } else await this.serial(start);
  }

  private adapterEvent(event: AdapterEvent, directory: string, expectedSessionId?: string) {
    if (this.finished || this.process !== event.handle) return;
    if (event.type === "activity") {
      this.conversation.record(event.event);
      return;
    }
    if (event.type === "session") {
      if (expectedSessionId && event.id !== expectedSessionId) {
        this.finish("failed", "SESSION_UNAVAILABLE");
        return;
      }
      this.ingest.session(event.id);
      return;
    }
    if (event.type === "turn-id") {
      this.conversation.setTurnId(event.id);
      return;
    }
    if (event.type === "failed") {
      this.finish("failed", "AGENT_PROTOCOL_FAILED");
      return;
    }
    this.completed(event, directory);
  }

  private watch(runner: ExecutionHandle, holdPlanOnExit: boolean) {
    void runner.completed.then(
      () => {
        if (!this.finished && this.process === runner && (!holdPlanOnExit || !this.awaitingPlan))
          this.finish(this.cancelled ? "cancelled" : "failed", "AGENT_EXITED");
      },
      () => {
        if (this.process === runner && !this.awaitingPlan)
          this.finish("failed", "AGENT_PROTOCOL_FAILED");
      },
    );
  }
  private acceptResult(runner: ExecutionHandle, turn: number) {
    if (
      this.finished ||
      this.process !== runner ||
      !this.turnActive ||
      this.turnVersion !== turn ||
      this.completedTurn === turn
    )
      return false;
    this.completedTurn = turn;
    return true;
  }
  private completed(event: Extract<AdapterEvent, { type: "completed" }>, directory: string) {
    const turn = this.turnVersion;
    void this.serial(async () => {
      if (event.turnId && this.adapter?.turnId && event.turnId !== this.adapter.turnId) return;
      if (!this.acceptResult(event.handle, turn)) return;
      clearTimeout(this.interruptTimer);
      this.interruptTimer = undefined;
      this.turnActive = false;
      const interrupted =
        event.status === "interrupted" || (event.status === "failed" && this.interrupting);
      const failed = event.status === "failed" && !this.interrupting;
      this.interrupting = false;
      this.conversation.endTurn(event.status === "completed" ? "complete" : "interrupted");
      this.summary = taskText(event.summary, 32_000);
      if (
        !failed &&
        (interrupted
          ? this.adapter?.input === "interrupt"
          : this.local.task.mode !== "plan" ||
            this.inputs.some((entry) => entry.mode === "steer" && entry.status === "sending")) &&
        (await this.nextInput())
      )
        return;
      if (
        event.status === "completed" &&
        !interrupted &&
        this.local.task.mode === "plan" &&
        !this.planRequestHandled
      ) {
        if (this.adapter?.planContinuation === "process") {
          this.awaitingPlan = true;
          await this.continuePlanProcess(event.handle, directory, event.preview);
        } else {
          const decision = await this.planDecision(
            this.adapter?.planTitle ?? "Agent",
            event.preview,
          );
          if (this.finished) return;
          const prompt = decision ? this.planPrompt(decision) : undefined;
          if (!prompt) {
            this.finish("cancelled");
            return;
          }
          await this.sendTurn!(prompt);
        }
        return;
      }
      this.finish(failed ? "failed" : interrupted ? "cancelled" : "succeeded", this.summary);
    });
  }

  private async planDecision(title: string, plan: string): Promise<HumanDecision | undefined> {
    const answer = this.ask("plan", title, plan);
    const request = [...this.pending.values()].find(
      (item) => item.request.kind === "plan",
    )?.request;
    const decision = await answer;
    return this.finished ||
      !request ||
      this.store.getRequest(this.local.binding, request.id)?.status !== "applied"
      ? undefined
      : decision;
  }

  private planPrompt(decision: HumanDecision): string | undefined {
    if (decision.type === "allow") {
      this.local.task.mode = "run";
      this.store.put(this.local);
      return "Implement the approved plan. Modify and validate only; do not commit, merge or push.";
    }
    return decision.type === "deny" && decision.note.trim() ? decision.note : undefined;
  }

  private async continuePlanProcess(runner: ExecutionHandle, directory: string, plan: string) {
    await runner.kill();
    await runner.completed.catch(() => {});
    if (this.finished) return;
    if (this.process === runner) this.process = undefined;
    if (
      !this.local.sessionId ||
      !plan.trim() ||
      plan.length > 128_000 ||
      Buffer.byteLength(JSON.stringify({ body: plan, questions: [] })) > 192 * 1024
    ) {
      this.finish("failed", "AGENT_PROTOCOL_FAILED");
      return;
    }
    const answer = this.planDecision(this.adapter?.planTitle ?? "Agent", plan);
    const request = [...this.pending.values()].find(
      (item) => item.request.kind === "plan",
    )?.request;
    const decision = await answer;
    if (this.finished) return;
    const applied = request && this.store.getRequest(this.local.binding, request.id);
    if (applied?.status !== "applied") {
      this.finish("cancelled");
      return;
    }
    const prompt = decision ? this.planPrompt(decision) : undefined;
    if (!prompt) {
      this.finish("cancelled");
      return;
    }
    this.summary = "";
    this.awaitingPlan = false;
    this.store.put(this.local);
    await this.run(directory, prompt);
  }
  cancel() {
    this.cancelled = true;
    this.finish("cancelled");
  }
  finish(status: AgentTask["status"], summary = "") {
    if (this.finished) return;
    this.finished = true;
    clearTimeout(this.interruptTimer);
    this.conversation.stop(status === "succeeded" ? "complete" : "interrupted");
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.resolve({ type: "deny", note: "Task stopped" });
    }
    this.pending.clear();
    const completion = (async () => {
      await this.process?.kill();
      await this.process?.completed.catch(() => {});
      this.unlock();
      this.effects.ended();
      this.effects.status(status, summary);
    })();
    this.effects.track(completion);
  }
}
