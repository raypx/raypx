import {
  ConversationRunner,
  type ConversationsRepository,
  type ConversationRunRepository,
} from "@raypx/agents/server";
import {
  runSchema,
  messageSchema,
  type ConversationEvent,
  type Run,
  type ReplySegment,
} from "@raypx/core/conversation";
import { conversationFixture } from "./conversations.js";
import { modelFixture } from "./model.js";

/** Repository double; transaction and FK behavior is covered by the real PostgreSQL suite. */
export function replyFixture() {
  const f = conversationFixture();
  const model = modelFixture();
  const runs: Run[] = [];
  const messages: ReturnType<typeof messageSchema.parse>[] = [];
  const segments: ReplySegment[] = [];
  const receipts = new Map<string, ReturnType<typeof messageSchema.parse>>();
  const now = () => new Date().toISOString();
  function publish(payload: object, message?: ReturnType<typeof messageSchema.parse>) {
    const event = {
      spaceId: f.spaceId,
      conversationId: f.conversationId,
      sequence: f.log.length + 1,
      createdAt: now(),
      ...payload,
    } as ConversationEvent;
    f.publish({ event, ...(message ? { message } : {}) });
    return event.sequence;
  }
  function state(run: Run) {
    publish({ kind: "run.state", runId: run.id, state: run.state, failureCode: run.failureCode });
  }
  const repository: ConversationsRepository & ConversationRunRepository = {
    ...f.conversations,
    async send(_scope, _id, input) {
      const existing = receipts.get(input.idempotencyKey);
      if (existing) return existing;
      const message = messageSchema.parse({
        id: crypto.randomUUID(),
        spaceId: f.spaceId,
        conversationId: f.conversationId,
        sequence: f.log.length + 1,
        author: { kind: "member", accountId: "member" },
        text: input.text,
        createdAt: now(),
      });
      receipts.set(input.idempotencyKey, message);
      messages.push(message);
      publish({ kind: "message.created", messageId: message.id }, message);
      const run = runSchema.parse({
        id: crypto.randomUUID(),
        spaceId: f.spaceId,
        conversationId: f.conversationId,
        agentId: "agent",
        trigger: "message",
        messageId: message.id,
        memberAccountId: "member",
        model: { modelId: "fixture" },
        state: "queued",
        failureCode: null,
        createdAt: now(),
        startedAt: null,
        firstResponseAt: null,
        finishedAt: null,
      });
      runs.push(run);
      state(run);
      return message;
    },
    async claimNext() {
      if (runs.some((run) => run.state === "running")) return undefined;
      const run = runs.find((candidate) => candidate.state === "queued");
      if (!run) return undefined;
      run.state = "running";
      run.startedAt = now();
      state(run);
      return { run, instructions: "Be helpful", history: [] };
    },
    async getRun(_scope, _id, id) {
      return runs.find((candidate) => candidate.id === id)!;
    },
    async stop(_scope, _id, id) {
      const run = runs.find((candidate) => candidate.id === id)!;
      if (run.state === "running" || run.state === "queued") {
        run.state = "cancelled";
        run.finishedAt = now();
        state(run);
      }
      return run;
    },
    async finish(_scope, run, failure) {
      if (run.state !== "running") return;
      run.state = failure ? "failed" : "succeeded";
      run.failureCode = failure;
      run.finishedAt = now();
      state(run);
    },
    async commitSegment(_scope, run, id, text, firstResponseAt) {
      if (run.state !== "running") return false;
      const segment: ReplySegment = {
        id,
        spaceId: f.spaceId,
        conversationId: f.conversationId,
        runId: run.id,
        sequence: f.log.length + 1,
        text,
        createdAt: now(),
      };
      segments.push(segment);
      run.firstResponseAt ??= firstResponseAt;
      publish({ kind: "reply.segment", segment });
      return true;
    },
    async snapshot() {
      throw new Error("Unused");
    },
  };
  const diagnostics: string[] = [];
  const runner = new ConversationRunner(repository, model.models, (code) => diagnostics.push(code));
  return {
    ...f,
    ...model,
    repository,
    runner,
    live: runner.live,
    conversations: runner.conversations,
    runs,
    messages,
    segments,
    diagnostics,
  };
}
