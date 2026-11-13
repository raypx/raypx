import { AiError, type AiStream, type Message as ModelMessage, type Tool } from "@raypx/ai";
import type { ConversationId } from "@raypx/core/agents";
import {
  MAX_REPLY_TEXT,
  type LiveReply,
  type Run,
  type RunFailure,
} from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";
import type {
  ConversationRunRepository,
  ConversationsRepository,
  RunExecution,
} from "./conversations.js";
import { EffectUnknownError, type ApprovalsService } from "./approvals.js";
import { ComputerToolsError, type ComputerTools } from "./computer-tools.js";

export interface ModelTurn extends Pick<RunExecution, "instructions" | "history"> {
  /** Process-local canonical tool turns; no checkpoint or automatic replay. */
  continuation?: ModelMessage[];
  tools?: Tool[];
}
export interface RunTools {
  tools: ComputerTools;
  approvals: ApprovalsService;
  maxToolRounds?: number;
}

/** Pinned Space/member identity permits a future member-owned connection adapter. */
export interface ModelAccess {
  resolve(
    this: void,
    run: Run,
  ): Promise<{
    stream(input: ModelTurn, signal: AbortSignal): AiStream;
  }>;
  close(): void;
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
export class ConversationRunner {
  readonly live = new LiveReplies();
  readonly conversations: ConversationsRepository;
  private readonly tasks = new Map<string, { dirty: boolean; done: Promise<void> }>();
  private readonly active = new Map<
    string,
    { controller: AbortController; scope: SpaceScope; run: Run }
  >();
  private closed = false;
  constructor(
    private readonly repository: ConversationsRepository & ConversationRunRepository,
    private readonly models: ModelAccess,
    private readonly diagnostic: (code: "EXECUTION_FAILED") => void = () => {},
    private readonly timing: (
      operation: "run.execution_started" | "run.first_response" | "run.finished",
      runId: string,
      durationMs: number,
    ) => void = () => {},
    private readonly toolRuntime?: RunTools,
  ) {
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
          this.active.get(runId)?.controller.abort();
          await this.toolRuntime?.tools.cancel(scope, run);
        }
        this.wake(scope, id);
        return run;
      },
    };
  }
  private wake(scope: SpaceScope, id: ConversationId) {
    if (this.closed) return;
    const key = JSON.stringify([scope.spaceId, id]);
    const existing = this.tasks.get(key);
    if (existing) {
      existing.dirty = true;
      return;
    }
    const task = { dirty: true, done: Promise.resolve() };
    this.tasks.set(key, task);
    // A separate task, independent of the HTTP request and its AbortSignal.
    task.done = new Promise<void>((resolve) => setTimeout(resolve, 0))
      .then(async () => {
        while (task.dirty && !this.closed) {
          task.dirty = false;
          for (;;) {
            if (this.closed) break;
            const execution = await this.repository.claimNext(scope, id);
            if (!execution) break;
            await this.execute(scope, execution);
          }
        }
      })
      .catch(() => {
        this.diagnostic("EXECUTION_FAILED");
      })
      .finally(() => {
        this.tasks.delete(key);
        if (task.dirty && !this.closed) this.wake(scope, id);
      });
  }
  private async execute(scope: SpaceScope, input: RunExecution) {
    const { run } = input;
    const controller = new AbortController();
    this.active.set(run.id, { controller, scope, run });
    this.timing(
      "run.execution_started",
      run.id,
      Math.max(0, Date.now() - Date.parse(run.createdAt)),
    );
    // Cross-process stop is observed without adding ownership, leases or recovery scans.
    const timer = setInterval(() => {
      void this.repository
        .getRun(scope, run.conversationId, run.id)
        .then((current) => {
          if (current.state === "cancelled") controller.abort();
        })
        .catch(() => controller.abort());
    }, 1_000);
    let errorCode: RunFailure | null = null;
    let storing = false;
    try {
      await this.toolRuntime?.approvals.assertContinuable(scope, run);
      const model = await this.models.resolve(run);
      if (controller.signal.aborted) return;
      const continuation: ModelMessage[] = [];
      const definitions = this.toolRuntime?.tools.definitions() ?? [];
      let rounds = 0;
      for (;;) {
        if (rounds > 0) await this.toolRuntime?.approvals.assertContinuable(scope, run);
        const stream = model.stream(
          { ...input, continuation, tools: definitions },
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
        for await (const event of stream) {
          if (controller.signal.aborted) break;
          if (event.type === "error") throw new AiError("AI_REQUEST_FAILED");
          if (event.type !== "text_delta") continue;
          if (event.delta) firstResponseAt ??= new Date().toISOString();
          text += event.delta;
          if (text.length > MAX_REPLY_TEXT) {
            errorCode = "REPLY_TOO_LARGE";
            controller.abort();
            break;
          }
          this.live.set({
            spaceId: run.spaceId,
            conversationId: run.conversationId,
            runId: run.id,
            segmentId,
            text,
          });
        }
        if (!controller.signal.aborted) {
          const result = await stream.result();
          if (result.stopReason === "error" || result.stopReason === "aborted")
            throw new AiError("AI_REQUEST_FAILED");
          text = result.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("");
          if (text.length > MAX_REPLY_TEXT) {
            errorCode = "REPLY_TOO_LARGE";
            return;
          }
          if (text) {
            firstResponseAt ??= new Date().toISOString();
            storing = true;
            const committed = await this.repository.commitSegment(
              scope,
              run,
              segmentId,
              text,
              firstResponseAt,
            );
            if (committed)
              this.timing(
                "run.first_response",
                run.id,
                Math.max(0, Date.parse(firstResponseAt) - Date.parse(run.startedAt!)),
              );
            storing = false;
          }
          this.live.clear(run);
          const calls = result.content.filter((part) => part.type === "toolCall");
          if (calls.length === 0) break;
          if (!this.toolRuntime || definitions.length === 0) throw new AiError("AI_REQUEST_FAILED");
          if (++rounds > (this.toolRuntime.maxToolRounds ?? 8) || calls.length > 16) {
            errorCode = "TOOL_ROUND_LIMIT";
            break;
          }
          const prepared = calls.map((call, index) => {
            try {
              return { call, prepared: this.toolRuntime!.tools.prepare(call) };
            } catch (error) {
              const code = error instanceof ComputerToolsError ? error.code : "INVALID_ARGUMENTS";
              return {
                call: {
                  type: "toolCall" as const,
                  id: `refused-${rounds}-${index}`,
                  name: "refused_tool",
                  arguments: {},
                },
                error: code,
              };
            }
          });
          // Invalid or secret arguments are omitted from subsequent model context.
          let callIndex = 0;
          continuation.push({
            ...result,
            content: result.content.map((part) => {
              if (part.type !== "toolCall") return part;
              return prepared[callIndex++]!.call;
            }),
          });
          for (const item of prepared) {
            if (controller.signal.aborted) break;
            await this.toolRuntime.approvals.assertContinuable(scope, run);
            let output: string;
            let isError = false;
            if (!item.prepared) {
              output = JSON.stringify({ untrusted: true, state: "refused", code: item.error });
              isError = true;
            } else {
              const decision = await this.toolRuntime.approvals.authorize(
                scope,
                run,
                item.prepared,
                controller.signal,
              );
              if (controller.signal.aborted || decision === "cancelled") break;
              if (decision !== "approved") {
                output = JSON.stringify({ untrusted: true, state: decision, refused: true });
                isError = true;
              } else {
                try {
                  const operation = () =>
                    this.toolRuntime!.tools.execute(scope, run, item.prepared, controller.signal);
                  output = item.prepared.changes
                    ? await this.toolRuntime.approvals.executeEffect(
                        scope,
                        run,
                        item.prepared,
                        operation,
                        controller.signal,
                      )
                    : await operation();
                  const state = (JSON.parse(output) as { state?: string }).state;
                  isError = state !== "succeeded";
                } catch (error) {
                  if (error instanceof EffectUnknownError) throw error;
                  const code = error instanceof ComputerToolsError ? error.code : "TOOL_FAILED";
                  output = JSON.stringify({ untrusted: true, state: "failed", code });
                  isError = true;
                }
              }
            }
            continuation.push({
              role: "toolResult",
              toolCallId: item.call.id,
              toolName: item.call.name,
              content: [{ type: "text", text: output }],
              isError,
              timestamp: Date.now(),
            });
          }
          if (controller.signal.aborted) break;
        } else break;
      }
    } catch (error) {
      if (error instanceof EffectUnknownError) errorCode = "EFFECT_UNKNOWN";
      else errorCode = storing ? "EXECUTION_FAILED" : failure(error);
    } finally {
      clearInterval(timer);
      this.active.delete(run.id);
      this.toolRuntime?.tools.release(run);
      // Cancellation already committed its terminal event. CAS prevents a late reply or failure.
      try {
        if (!controller.signal.aborted || errorCode)
          await this.repository.finish(scope, run, errorCode);
      } finally {
        this.live.clear(run);
        this.timing("run.finished", run.id, Math.max(0, Date.now() - Date.parse(run.startedAt!)));
      }
    }
  }
  async close() {
    this.closed = true;
    await Promise.all(
      [...this.active.values()].map(async ({ controller, scope, run }) => {
        try {
          await this.repository.stop(scope, run.conversationId, run.id);
        } catch {
          this.diagnostic("EXECUTION_FAILED");
        } finally {
          controller.abort();
          await this.toolRuntime?.tools.cancel(scope, run);
        }
      }),
    );
    await Promise.all([...this.tasks.values()].map((task) => task.done));
    this.models.close();
  }
}
