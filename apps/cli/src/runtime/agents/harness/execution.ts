import {
  taskText,
  taskExecutionPrompt,
  humanRequestSchema,
  type AgentTask,
  type HumanDecision,
  type HumanRequest,
  type TaskInput,
} from "@raypx/contracts/tasks";
import { LocalError } from "../../errors";
import type { AgentStore, LocalAgentTask } from "../store";
import type { ConversationRecorder } from "../activity";
import { createDriver, type ExecutionDriver, type ExecutionHandle } from "./registry";

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
    (task.provider === "codex" && task.mode === "plan"
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

/** One execution uses persistence without owning SQLite or its lifecycle. */
export type ExecutionStore = Pick<
  AgentStore,
  "get" | "put" | "recordActivity" | "request" | "getRequest" | "tokenUsage"
>;
interface ExecutionEffects {
  status(status: AgentTask["status"], summary?: string): void;
  changed(pendingRequest?: string): void;
  resolved(requestId: string): void;
  hook(): { url: string; token: string };
  /** Provider processes inherit this, including the bundled `bun` PATH entry. */
  environment(): Record<string, string | undefined>;
  track(completion: Promise<void>): void;
  ended(): void;
}
type Pending = {
  request: HumanRequest;
  resolve(decision: HumanDecision): void;
  timer: ReturnType<typeof setTimeout>;
};
const text = (value: unknown, max = 128_000) =>
  typeof value === "string" ? taskText(value, max) : "";

/** Single owner for turn/input/approval state and the project lock through process draining. */
export class ManagedExecution {
  private process: ExecutionHandle | undefined;
  private provider: ExecutionDriver | undefined;
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
    private readonly conversation: ConversationRecorder,
    private readonly unlock: () => void,
    private readonly store: ExecutionStore,
    private readonly effects: ExecutionEffects,
    private readonly interruptTimeoutMs = 10_000,
    private readonly driverFactory: typeof createDriver = createDriver,
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
  applyDecision(id: string, decision: HumanDecision) {
    const pending = this.pending.get(id);
    if (pending && Date.parse(pending.request.expiresAt) > Date.now()) {
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.resolve(decision);
      this.store.request(this.local.binding, { ...pending.request, status: "applied", decision });
      this.effects.resolved(id);
    }
  }
  enqueue(request: { id: string; mode: TaskInput["mode"]; prompt: string }) {
    if (this.finished || this.cancelled) throw new LocalError("TASK_STOPPED", "Task stopped");
    if (!this.ready) throw new LocalError("TASK_NOT_READY", "Agent is starting");
    if (request.mode === "steer" && (this.pending.size || this.awaitingPlan))
      throw new LocalError("INPUT_WAITING_APPROVAL", "Answer the pending approval first");
    if (this.inputs.length >= 20) throw new LocalError("INPUT_QUEUE_FULL", "Input queue is full");
    if (request.mode === "steer" && this.inputs.some((entry) => entry.mode === "steer"))
      throw new LocalError("INPUT_IN_PROGRESS", "A steer is being delivered");
    const now = new Date().toISOString();
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
        const provider = this.provider!;
        if (provider.input === "steer") {
          this.inputStatus(entry, "sending");
          try {
            await provider.steer(entry.text, this.local.sessionId);
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
            await provider.interrupt();
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
        updatedAt: new Date().toISOString(),
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
    const expiresAt = new Date(Math.min(Date.now() + 600_000, deadline ?? Infinity)).toISOString();
    const request = humanRequestSchema.parse({
      id: crypto.randomUUID(),
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
        Math.max(1, Date.parse(expiresAt) - Date.now()),
      );
      this.pending.set(request.id, { request, resolve, timer });
    });
    this.effects.changed(this.local.binding.startsWith("desktop:") ? request.id : undefined);
    const result = await answer;
    if (!this.cancelled && !this.finished) this.effects.status("running");
    return result;
  }
  async run(executable: string, directory: string, continuationPrompt?: string) {
    const task = this.local.task;
    const parent = task.parentTaskId ? this.store.get(task.parentTaskId) : undefined;
    const sessionId = executionSession(this.local, parent);
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
    const provider = this.driverFactory(
      task.provider,
      {
        executable,
        directory,
        mode: task.mode,
        environment: this.effects.environment(),
        ...(sessionId ? { sessionId } : {}),
      },
      {
        approval: { ask: (...args) => this.ask(...args), hook: () => this.effects.hook() },
        current: (handle) => !this.finished && this.process === handle,
        codexRecord: (method, params) => this.conversation.codex(method, params),
        claudeRecord: (message) => this.conversation.claude(message),
        session: (id) => {
          if (sessionId && id !== sessionId) {
            this.finish("failed", "SESSION_UNAVAILABLE");
            return;
          }
          this.local.sessionId = id;
          this.store.put(this.local);
        },
        codexCompleted: (driver, status, turnId) => this.codexCompleted(driver, status, turnId),
        claudeCompleted: (handle, message) =>
          this.claudeCompleted(handle, message, executable, directory),
        failed: (handle) => {
          if (this.process === handle) this.finish("failed", "AGENT_PROTOCOL_FAILED");
        },
        turnId: (id) => this.conversation.setTurnId(id),
      },
    );
    this.provider = provider;
    this.process = provider.handle;
    if (!provider.holdPlanOnExit) this.watch(provider.handle, false);
    const initializedSession = await provider.initialize(task.mode, sessionId);
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
      await provider.sendTurn(prompt, this.local.sessionId, task.mode);
    };
    const start = async () => {
      await this.sendTurn!(initialExecutionPrompt(task, continuationPrompt, Boolean(sessionId)));
      this.ready = true;
    };
    // Claude plan approval may replace the driver while already in the serial queue.
    if (provider.holdPlanOnExit) {
      await start();
      this.watch(provider.handle, true);
    } else await this.serial(start);
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
  private codexCompleted(provider: ExecutionDriver, status: unknown, turnId?: string) {
    const turn = this.turnVersion;
    void this.serial(async () => {
      // Sending may still be awaiting the turn/start reply when completion arrives.
      // Check the authoritative id after that operation, before claiming this turn.
      if (turnId && provider.turnId && turnId !== provider.turnId) return;
      if (!this.acceptResult(provider.handle, turn)) return;
      clearTimeout(this.interruptTimer);
      this.interruptTimer = undefined;
      this.turnActive = false;
      this.conversation.endTurn(status === "completed" ? "complete" : "interrupted");
      if (status === "completed" && this.local.task.mode === "plan") {
        const decision = await this.ask("plan", "Codex", provider.preview);
        if (this.finished) return;
        if (decision.type !== "allow") {
          if (decision.type === "deny" && decision.note.trim()) await this.sendTurn!(decision.note);
          else this.finish("cancelled");
          return;
        }
        this.local.task.mode = "run";
        this.store.put(this.local);
        await this.sendTurn!(
          "Implement the approved plan. Modify and validate only; do not commit, merge or push.",
        );
        return;
      }
      if (status === "completed" && (await this.nextInput())) return;
      this.finish(
        status === "completed" ? "succeeded" : status === "interrupted" ? "cancelled" : "failed",
        provider.summary,
      );
    });
  }
  private claudeCompleted(
    runner: ExecutionHandle,
    message: Record<string, unknown>,
    executable: string,
    directory: string,
  ) {
    const interrupted = message.is_error === true && this.interrupting;
    const turn = this.turnVersion;
    void this.serial(async () => {
      // A result can wait behind a plan decision that replaces its process.
      // Ownership and turn identity must still hold when the operation runs.
      if (!this.acceptResult(runner, turn)) return;
      clearTimeout(this.interruptTimer);
      this.interruptTimer = undefined;
      this.turnActive = false;
      this.interrupting = false;
      this.conversation.endTurn(
        message.is_error === true || interrupted ? "interrupted" : "complete",
      );
      this.summary = text(message.result, 32_000);
      if (
        (message.is_error !== true || interrupted) &&
        (interrupted ||
          this.local.task.mode !== "plan" ||
          this.inputs.some((entry) => entry.mode === "steer" && entry.status === "sending")) &&
        (await this.nextInput())
      )
        return;
      if (
        message.is_error !== true &&
        !interrupted &&
        this.local.task.mode === "plan" &&
        !this.planRequestHandled
      ) {
        this.awaitingPlan = true;
        await this.continueClaudePlan(runner, executable, directory, text(message.result, 128_001));
        return;
      }
      this.finish(message.is_error === true ? "failed" : "succeeded", this.summary);
    });
  }
  private async continueClaudePlan(
    runner: ExecutionHandle,
    executable: string,
    directory: string,
    plan: string,
  ) {
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
    const answer = this.ask("plan", "Claude Code", plan);
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
    let prompt: string;
    if (decision.type === "allow") {
      this.local.task.mode = "run";
      prompt =
        "Implement the approved plan. Modify and validate only; do not commit, merge or push.";
    } else if (decision.type === "deny" && decision.note.trim()) {
      prompt = decision.note;
    } else {
      this.finish("cancelled");
      return;
    }
    this.summary = "";
    this.awaitingPlan = false;
    this.store.put(this.local);
    await this.run(executable, directory, prompt);
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
