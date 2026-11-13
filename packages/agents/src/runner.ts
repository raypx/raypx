import { AiError, type AiStream } from "@raypx/ai";
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

/** Pinned Space/member identity permits a future member-owned connection adapter. */
export interface ModelAccess {
  resolve(
    this: void,
    run: Run,
  ): Promise<{
    stream(input: Pick<RunExecution, "instructions" | "history">, signal: AbortSignal): AiStream;
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
  ) {
    this.conversations = {
      ...repository,
      send: async (scope, id, input) => {
        const message = await repository.send(scope, id, input);
        this.wake(scope, id);
        return message;
      },
      stop: async (scope, id, runId) => {
        const run = await repository.stop(scope, id, runId);
        if (run.state === "cancelled") this.active.get(runId)?.controller.abort();
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
      const model = await this.models.resolve(run);
      if (controller.signal.aborted) return;
      const stream = model.stream(input, controller.signal);
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
        if (
          result.stopReason === "error" ||
          result.stopReason === "aborted" ||
          result.content.some((part) => part.type === "toolCall")
        )
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
        }
      }
    } catch (error) {
      errorCode = storing ? "EXECUTION_FAILED" : failure(error);
    } finally {
      clearInterval(timer);
      this.active.delete(run.id);
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
        }
      }),
    );
    await Promise.all([...this.tasks.values()].map((task) => task.done));
    this.models.close();
  }
}
