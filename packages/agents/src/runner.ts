import {
  AiError,
  type AiStream,
  type AssistantMessage,
  type Message as ModelMessage,
  type Tool,
  type ToolCall,
} from "@raypx/ai";
import type { ConversationId } from "@raypx/core/agents";
import {
  MAX_REPLY_TEXT,
  type LiveReply,
  type Run,
  type RunFailure,
} from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  StaleRunFenceError,
  type ConversationFanout,
  type ConversationRunRepository,
  type ConversationsRepository,
  type ExecutionRun,
  type RunCheckpoint,
  type RunExecution,
} from "./conversations.js";
import { EffectInProgressError, EffectUnknownError, type ApprovalsService } from "./approvals.js";
import { ComputerToolsError, type ComputerTools } from "./computer-tools.js";

export interface ModelTurn extends Pick<RunExecution, "instructions" | "history"> {
  /** Canonical model history after the initial conversation context. */
  continuation?: ModelMessage[];
  tools?: Tool[];
}
export interface RunTools {
  tools: ComputerTools;
  approvals: ApprovalsService;
  maxToolRounds?: number;
}

/** Credentials stay in the adapter; only its opaque connection identity is persisted. */
export interface ModelAccess {
  resolve(
    this: void,
    run: Run,
  ): Promise<{
    connectionId?: string;
    stream(input: ModelTurn, signal: AbortSignal): AiStream;
  }>;
  close(): void;
}
export interface RunnerOptions {
  ownerId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
  scanIntervalMs?: number;
  attemptTimeoutMs?: number;
  backupMarginMs?: number;
  maxAttempts?: number;
}
export interface RunTimings {
  waitBeforeCreationMs: number;
  waitBeforeStartMs: number;
  firstResponseMs?: number;
  totalMs?: number;
}

/** Current open segments only. No prompts, reasoning or provider metadata. */
export class LiveReplies {
  private readonly replies = new Map<string, LiveReply>();
  private readonly listeners = new Set<(conversationId: string) => void>();
  read(spaceId: string, conversationId: string) {
    return this.replies.get(JSON.stringify([spaceId, conversationId]));
  }
  subscribe(listener: (conversationId: string) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  set(reply: LiveReply) {
    this.replies.set(JSON.stringify([reply.spaceId, reply.conversationId]), reply);
    for (const listener of this.listeners) listener(reply.conversationId);
  }
  clear(run: Run) {
    this.replies.delete(JSON.stringify([run.spaceId, run.conversationId]));
    for (const listener of this.listeners) listener(run.conversationId);
  }
}
function failure(error: unknown): RunFailure {
  if (error instanceof EffectUnknownError) return "EFFECT_UNKNOWN";
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "CONNECTION_UNAVAILABLE") return "CONNECTION_UNAVAILABLE";
    if (error.code === "COMPUTER_UNAVAILABLE") return "COMPUTER_UNAVAILABLE";
  }
  if (!(error instanceof AiError)) return "MODEL_FAILED";
  const codes: Partial<Record<AiError["code"], RunFailure>> = {
    AI_MODEL_NOT_FOUND: "MODEL_UNAVAILABLE",
    AI_INVALID_CONFIG: "MODEL_NOT_CONFIGURED",
    AI_AUTH_REQUIRED: "MODEL_AUTH_REQUIRED",
    AI_RATE_LIMITED: "MODEL_RATE_LIMITED",
    AI_TIMEOUT: "MODEL_TIMEOUT",
  };
  return codes[error.code] ?? "MODEL_FAILED";
}
function retryDelay(error: unknown, attemptNumber: number): number | undefined {
  if (!(error instanceof AiError)) return undefined;
  if (!["AI_RATE_LIMITED", "AI_TIMEOUT", "AI_REQUEST_FAILED"].includes(error.code))
    return undefined;
  if (error.retryAt !== undefined && Number.isFinite(error.retryAt))
    return Math.max(0, error.retryAt - Date.now());
  return Math.min(60_000, 1_000 * 2 ** Math.min(attemptNumber - 1, 6));
}
class AttemptInterrupted extends Error {
  constructor() {
    super("ATTEMPT_INTERRUPTED");
  }
}
/** Bounds shutdown even if an adapter does not settle promptly after cancellation. */
function interruptible<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(new AttemptInterrupted());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new AttemptInterrupted());
    signal.addEventListener("abort", abort, { once: true });
    void promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
function key(scope: SpaceScope, id: ConversationId) {
  return JSON.stringify([scope.spaceId, id]);
}
function positive(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Invalid ${label}`);
  return value;
}
function timings(run: Run): RunTimings {
  return {
    // Message-triggered work has no scheduled wait before creation.
    waitBeforeCreationMs: 0,
    waitBeforeStartMs: Math.max(
      0,
      Date.parse(run.startedAt ?? run.createdAt) - Date.parse(run.createdAt),
    ),
  };
}
interface ActiveAttempt {
  controller: AbortController;
  scope: SpaceScope;
  run: ExecutionRun;
  pendingWork?: Promise<unknown>;
  cancellation?: Promise<void>;
}
export class ConversationRunner {
  readonly live = new LiveReplies();
  readonly conversations: ConversationsRepository;
  readonly ownerId: string;
  private readonly options: Required<Omit<RunnerOptions, "ownerId">>;
  private readonly tasks = new Map<string, { dirty: boolean; done: Promise<void> }>();
  private readonly retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly active = new Map<string, ActiveAttempt>();
  private closed = false;
  private accepting = true;
  private workerTimer: ReturnType<typeof setInterval> | undefined;
  private unsubscribe: (() => Promise<void>) | undefined;
  private scanning: Promise<void> | undefined;
  private scanAgain = false;
  private closing: Promise<void> | undefined;
  constructor(
    private readonly repository: ConversationsRepository & ConversationRunRepository,
    private readonly models: ModelAccess,
    private readonly diagnostic: (code: "EXECUTION_FAILED") => void = () => {},
    private readonly timing: (
      operation: "run.execution_started" | "run.first_response" | "run.finished",
      runId: string,
      durationMs: number,
      durations?: RunTimings,
    ) => void = () => {},
    private readonly toolRuntime?: RunTools,
    options: RunnerOptions = {},
  ) {
    this.ownerId = options.ownerId ?? crypto.randomUUID();
    if (!this.ownerId || this.ownerId.length > 128) throw new RangeError("Invalid owner identity");
    this.options = {
      leaseMs: positive(options.leaseMs ?? 15_000, "lease duration"),
      heartbeatMs: positive(options.heartbeatMs ?? 5_000, "heartbeat interval"),
      scanIntervalMs: positive(options.scanIntervalMs ?? 5_000, "recovery interval"),
      attemptTimeoutMs: positive(options.attemptTimeoutMs ?? 300_000, "attempt timeout"),
      backupMarginMs: positive(options.backupMarginMs ?? 30_000, "backup margin"),
      maxAttempts: positive(options.maxAttempts ?? 5, "attempt limit"),
    };
    if (this.options.heartbeatMs >= this.options.leaseMs)
      throw new RangeError("Heartbeat interval must be shorter than the lease");
    if (
      toolRuntime?.maxToolRounds !== undefined &&
      (!Number.isSafeInteger(toolRuntime.maxToolRounds) ||
        toolRuntime.maxToolRounds < 1 ||
        toolRuntime.maxToolRounds > 32)
    )
      throw new RangeError("Invalid tool round limit");
    this.conversations = {
      ...repository,
      send: async (scope, id, input) => {
        const message = await repository.send(scope, id, input);
        this.wake(scope, id);
        return message;
      },
      stop: async (scope, id, runId) => {
        const run = await repository.stop(scope, id, runId);
        if (run.state === "cancelled") {
          const active = this.active.get(runId);
          if (active) {
            Object.assign(active.run, run);
            active.controller.abort("cancelled");
          }
          await this.toolRuntime?.tools.cancel(scope, run);
        }
        this.wake(scope, id);
        return run;
      },
    };
  }
  /** Worker startup owns scans and LISTEN subscriptions; construction never touches storage. */
  async startWorker(fanout?: ConversationFanout) {
    if (!this.accepting || this.closed || this.workerTimer) return;
    if (fanout)
      this.unsubscribe = await fanout.subscribe(() => {
        void this.scan().catch(() => this.diagnostic("EXECUTION_FAILED"));
      });
    this.workerTimer = setInterval(() => {
      void this.scan().catch(() => this.diagnostic("EXECUTION_FAILED"));
    }, this.options.scanIntervalMs);
    this.workerTimer.unref();
    await this.scan();
  }
  private scan(): Promise<void> {
    if (!this.accepting || this.closed) return Promise.resolve();
    this.scanAgain = true;
    if (this.scanning) return this.scanning;
    this.scanning = (async () => {
      while (this.scanAgain && this.accepting && !this.closed) {
        this.scanAgain = false;
        const [runnable, backup] = await Promise.all([
          this.repository.scanRunnable(),
          this.repository.claimBackupJobs(this.ownerId, this.options.leaseMs),
        ]);
        for (const { scope, id } of [...runnable, ...backup]) this.wake(scope, id);
      }
    })().finally(() => {
      this.scanning = undefined;
    });
    return this.scanning;
  }
  private scheduleRetry(scope: SpaceScope, id: ConversationId, dueAt: Date) {
    if (!this.accepting || this.closed) return;
    const taskKey = key(scope, id);
    clearTimeout(this.retryTimers.get(taskKey));
    const timer = setTimeout(
      () => {
        this.retryTimers.delete(taskKey);
        this.wake(scope, id);
      },
      Math.max(1, dueAt.getTime() - Date.now()),
    );
    timer.unref();
    this.retryTimers.set(taskKey, timer);
  }
  private wake(scope: SpaceScope, id: ConversationId) {
    if (!this.accepting || this.closed) return;
    const taskKey = key(scope, id);
    const existing = this.tasks.get(taskKey);
    if (existing) {
      existing.dirty = true;
      return;
    }
    const task = { dirty: true, done: Promise.resolve() };
    this.tasks.set(taskKey, task);
    // A separate task, independent of the HTTP request and its AbortSignal.
    task.done = new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(async () => {
        while (task.dirty && this.accepting && !this.closed) {
          task.dirty = false;
          for (;;) {
            if (!this.accepting || this.closed) break;
            const execution = await this.repository.claimNext(scope, id, {
              ownerId: this.ownerId,
              leaseMs: this.options.leaseMs,
              timeoutMs: this.options.attemptTimeoutMs,
              backupMarginMs: this.options.backupMarginMs,
            });
            if (!execution) break;
            // Closing can race with the atomic claim. Release that claim as well.
            if (!this.accepting || this.closed) {
              await this.repository.release(execution.scope, execution.run);
              break;
            }
            await this.execute(execution.scope, execution);
          }
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof StaleRunFenceError)) this.diagnostic("EXECUTION_FAILED");
      })
      .finally(() => {
        this.tasks.delete(taskKey);
        if (task.dirty && this.accepting && !this.closed) this.wake(scope, id);
      });
  }
  private prepared(call: ToolCall) {
    try {
      return this.toolRuntime?.tools.prepare(call);
    } catch {
      return undefined;
    }
  }
  private canonicalTurn(result: AssistantMessage, rounds: number): AssistantMessage {
    let index = 0;
    return {
      ...result,
      content: result.content.map((part) => {
        if (part.type !== "toolCall") return part;
        const callIndex = index++;
        try {
          if (!this.toolRuntime) throw new ComputerToolsError("INVALID_TOOL");
          this.toolRuntime.tools.prepare(part);
          return part;
        } catch (error) {
          const code = error instanceof ComputerToolsError ? error.code : "INVALID_ARGUMENTS";
          // Refused/secret arguments never enter the durable model history.
          return {
            type: "toolCall" as const,
            id: `refused-${rounds}-${callIndex}`,
            name: "refused_tool",
            arguments: { code },
          };
        }
      }),
    };
  }
  private async toolResult(
    scope: SpaceScope,
    run: ExecutionRun,
    call: ToolCall,
    controller: AbortController,
  ): Promise<ModelMessage> {
    const prepared = this.prepared(call);
    let output: string;
    let isError = false;
    if (!prepared || !this.toolRuntime) {
      const code = call.name === "refused_tool" ? call.arguments.code : "INVALID_TOOL";
      output = JSON.stringify({ untrusted: true, state: "refused", code });
      isError = true;
    } else {
      const decision = await interruptible(
        this.toolRuntime.approvals.authorize(scope, run, prepared, controller.signal),
        controller.signal,
      );
      if (controller.signal.aborted || decision === "cancelled") throw new AttemptInterrupted();
      if (decision !== "approved") {
        output = JSON.stringify({ untrusted: true, state: decision, refused: true });
        isError = true;
      } else {
        try {
          const operation = () =>
            this.toolRuntime!.tools.execute(scope, run, prepared, controller.signal);
          const result = prepared.changes
            ? this.toolRuntime.approvals.executeEffect(
                scope,
                run,
                prepared,
                operation,
                controller.signal,
              )
            : operation();
          const active = this.active.get(run.id);
          if (active) active.pendingWork = result;
          void result.then(
            () => {
              if (active?.pendingWork === result) delete active.pendingWork;
            },
            () => {
              if (active?.pendingWork === result) delete active.pendingWork;
            },
          );
          output = await interruptible(result, controller.signal);
          const state = (JSON.parse(output) as { state?: string }).state;
          isError = state !== "succeeded";
        } catch (error) {
          if (
            error instanceof EffectUnknownError ||
            error instanceof EffectInProgressError ||
            error instanceof StaleRunFenceError ||
            error instanceof AttemptInterrupted
          )
            throw error;
          const code = error instanceof ComputerToolsError ? error.code : "TOOL_FAILED";
          output = JSON.stringify({ untrusted: true, state: "failed", code });
          isError = true;
        }
      }
    }
    return {
      role: "toolResult",
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: "text", text: output }],
      isError,
      timestamp: Date.now(),
    };
  }
  private async settleCancelledWork(active: ActiveAttempt) {
    if (!active.pendingWork && !active.cancellation) return;
    // A clean Computer cancellation can return a confirmed outcome. Give that
    // already-started persistence a bounded chance to commit before handover.
    // An unresponsive provider leaves its intent for conservative recovery.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled([active.pendingWork, active.cancellation]),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, Math.max(1, Math.min(1_000, this.options.leaseMs / 2)));
        timer.unref();
      }),
    ]);
    clearTimeout(timer);
  }
  private async execute(scope: SpaceScope, input: RunExecution) {
    const { run } = input;
    const controller = new AbortController();
    const active: ActiveAttempt = { controller, scope, run };
    this.active.set(run.id, active);
    let beating = false;
    const heartbeat = setInterval(() => {
      if (beating || controller.signal.aborted) return;
      beating = true;
      void this.repository
        .heartbeat(scope, run, this.options.leaseMs)
        .then(async (owned) => {
          if (owned) return;
          const current = await this.repository.getRun(scope, run.conversationId, run.id);
          if (current.state === "cancelled") Object.assign(run, current);
          controller.abort(current.state === "cancelled" ? "cancelled" : "lease-lost");
          await this.toolRuntime?.tools.cancel(scope, run);
        })
        .catch(() => controller.abort("lease-lost"))
        .finally(() => {
          beating = false;
        });
    }, this.options.heartbeatMs);
    heartbeat.unref();
    const deadline = setTimeout(
      () => controller.abort("timeout"),
      Math.max(1, Date.parse(run.timeoutAt) - Date.now()),
    );
    deadline.unref();
    let errorCode: RunFailure | null = null;
    let retryAt: Date | undefined;
    let terminal = false;
    let storing = false;
    let checkpoint: RunCheckpoint = structuredClone(input.checkpoint);
    try {
      await this.toolRuntime?.approvals.assertContinuable(scope, run);
      await this.toolRuntime?.tools.initialize?.(scope, run, controller.signal);
      storing = true;
      run.startedAt = await this.repository.executionStarted(scope, run);
      storing = false;
      this.timing("run.execution_started", run.id, timings(run).waitBeforeStartMs, timings(run));
      const model = await interruptible(this.models.resolve(run), controller.signal);
      if (model.connectionId && !run.connectionId) {
        storing = true;
        await this.repository.pinResources(scope, run, { connectionId: model.connectionId });
        storing = false;
        run.connectionId = model.connectionId;
      }
      const definitions = this.toolRuntime?.tools.definitions(run) ?? [];
      for (;;) {
        if (controller.signal.aborted) throw new AttemptInterrupted();
        await this.toolRuntime?.approvals.assertContinuable(scope, run);
        // A recovered turn executes only unfinished calls. Recorded effect outcomes
        // are reused by executeEffect when a crash preceded the tool checkpoint.
        while (checkpoint.pendingCalls.length) {
          const call = checkpoint.pendingCalls[0]!;
          const output = await this.toolResult(scope, run, call, controller);
          checkpoint.continuation.push(output);
          checkpoint.pendingCalls.shift();
          storing = true;
          await this.repository.saveCheckpoint(scope, run, checkpoint);
          storing = false;
        }
        storing = true;
        checkpoint = await this.repository.consumeSteering(scope, run, checkpoint);
        storing = false;
        if (checkpoint.completed) {
          // finish checks steering under the same lock as send, closing the last-turn race.
          storing = true;
          terminal = await this.repository.finish(scope, run, null);
          storing = false;
          if (terminal) break;
          continue;
        }
        const stream = model.stream(
          { ...input, continuation: checkpoint.continuation, tools: definitions },
          controller.signal,
        );
        let text = "";
        let firstResponseAt: string | undefined;
        const segmentId = crypto.randomUUID();
        this.live.set({
          spaceId: run.spaceId,
          conversationId: run.conversationId,
          runId: run.id,
          segmentId,
          text,
        });
        const iterator = stream[Symbol.asyncIterator]();
        for (;;) {
          const item = await interruptible(iterator.next(), controller.signal);
          if (item.done) break;
          const event = item.value;
          if (event.type === "error") throw new AiError("AI_REQUEST_FAILED");
          if (event.type !== "text_delta") continue;
          if (event.delta) firstResponseAt ??= new Date().toISOString();
          text += event.delta;
          if (text.length > MAX_REPLY_TEXT) {
            errorCode = "REPLY_TOO_LARGE";
            controller.abort("reply-too-large");
            throw new AttemptInterrupted();
          }
          this.live.set({
            spaceId: run.spaceId,
            conversationId: run.conversationId,
            runId: run.id,
            segmentId,
            text,
          });
        }
        const result = await interruptible(stream.result(), controller.signal);
        if (result.stopReason === "error" || result.stopReason === "aborted")
          throw new AiError("AI_REQUEST_FAILED");
        text = result.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
        if (text.length > MAX_REPLY_TEXT) {
          errorCode = "REPLY_TOO_LARGE";
          break;
        }
        const calls = result.content.filter((part) => part.type === "toolCall");
        if (calls.length && (!this.toolRuntime || definitions.length === 0))
          throw new AiError("AI_REQUEST_FAILED");
        if (
          calls.length &&
          (++checkpoint.rounds > (this.toolRuntime?.maxToolRounds ?? 8) || calls.length > 16)
        ) {
          errorCode = "TOOL_ROUND_LIMIT";
          break;
        }
        const canonical = this.canonicalTurn(result, checkpoint.rounds);
        checkpoint.continuation.push(canonical);
        checkpoint.pendingCalls = canonical.content.filter((part) => part.type === "toolCall");
        checkpoint.completed = calls.length === 0;
        if (text) firstResponseAt ??= new Date().toISOString();
        storing = true;
        const committed = await this.repository.commitTurn(scope, run, {
          checkpoint,
          ...(text ? { segmentId, text, firstResponseAt: firstResponseAt! } : {}),
        });
        storing = false;
        if (committed) {
          run.firstResponseAt = firstResponseAt!;
          const duration = Math.max(
            0,
            Date.parse(run.firstResponseAt) - Date.parse(run.startedAt ?? run.createdAt),
          );
          this.timing("run.first_response", run.id, duration, {
            ...timings(run),
            firstResponseMs: duration,
          });
        }
        this.live.clear(run);
      }
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === "timeout") {
          errorCode = "MODEL_TIMEOUT";
          if (run.attemptNumber < this.options.maxAttempts)
            retryAt = new Date(
              Date.now() + retryDelay(new AiError("AI_TIMEOUT"), run.attemptNumber)!,
            );
        }
      } else if (error instanceof EffectInProgressError) {
        // An abandoned intent is not replayable. Revisit only once it can be
        // classified unknown by the authoritative effects repository.
        errorCode = "EXECUTION_FAILED";
        retryAt = new Date(Math.max(Date.now() + 1, error.retryAt));
      } else if (error instanceof StaleRunFenceError) {
        controller.abort("lease-lost");
      } else {
        errorCode = storing ? "EXECUTION_FAILED" : failure(error);
        const delay = storing
          ? Math.min(60_000, 1_000 * 2 ** Math.min(run.attemptNumber - 1, 6))
          : retryDelay(error, run.attemptNumber);
        if (delay !== undefined && run.attemptNumber < this.options.maxAttempts)
          retryAt = new Date(Date.now() + delay);
      }
    } finally {
      clearInterval(heartbeat);
      clearTimeout(deadline);
      try {
        if (controller.signal.reason === "handover" || controller.signal.reason === "timeout")
          await this.settleCancelledWork(active);
        if (!terminal) {
          if (errorCode) {
            await this.repository.finish(scope, run, errorCode, retryAt);
            terminal = !retryAt;
            if (retryAt) this.scheduleRetry(scope, run.conversationId, retryAt);
          } else if (controller.signal.reason !== "cancelled") {
            await this.repository.release(scope, run);
          }
        }
      } catch (error) {
        if (!(error instanceof StaleRunFenceError)) this.diagnostic("EXECUTION_FAILED");
      } finally {
        if (controller.signal.reason === "cancelled") terminal = true;
        this.active.delete(run.id);
        this.toolRuntime?.tools.release(run);
        this.live.clear(run);
        if (terminal) {
          const finishedAt = run.finishedAt ? Date.parse(run.finishedAt) : Date.now();
          const totalMs = Math.max(0, finishedAt - Date.parse(run.startedAt ?? run.createdAt));
          this.timing("run.finished", run.id, totalMs, { ...timings(run), totalMs });
        }
      }
    }
  }
  /** Signal admission ends before HTTP drain; active attempts keep their leases until close. */
  stopClaiming(): void {
    this.accepting = false;
    clearInterval(this.workerTimer);
    for (const timer of this.retryTimers.values()) clearTimeout(timer);
    this.retryTimers.clear();
  }
  close(): Promise<void> {
    return (this.closing ??= this.closeOwned());
  }
  private async closeOwned() {
    this.stopClaiming();
    this.closed = true;
    await this.unsubscribe?.();
    await this.scanning?.catch(() => {});
    await Promise.all(
      [...this.active.values()].map(async (active) => {
        // Register cancellation before abort wakes the executor finalizer.
        active.cancellation = Promise.resolve()
          .then(() => this.toolRuntime?.tools.cancel(active.scope, active.run))
          .catch(() => {
            this.diagnostic("EXECUTION_FAILED");
          });
        active.controller.abort("handover");
        await this.settleCancelledWork(active);
      }),
    );
    await Promise.all([...this.tasks.values()].map((task) => task.done));
    this.models.close();
  }
}
