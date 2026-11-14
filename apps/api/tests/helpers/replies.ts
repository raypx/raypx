import {
  ConversationRunner,
  type ConversationsRepository,
  type ConversationRunRepository,
  type RunTools,
  type ExecutionRun,
  type RunCheckpoint,
  StaleRunFenceError,
} from "@raypx/agents/server";
import {
  runSchema,
  messageSchema,
  type ConversationEvent,
  type ReplySegment,
  type ToolActivity,
} from "@raypx/core/conversation";
import { conversationFixture } from "./conversations.js";
import { modelFixture } from "./model.js";

/** Repository double; transaction and FK behavior is covered by the real PostgreSQL suite. */
export function replyFixture(toolRuntime?: RunTools) {
  const f = conversationFixture();
  const model = modelFixture();
  const runs: ExecutionRun[] = [];
  const messages: ReturnType<typeof messageSchema.parse>[] = [];
  const segments: ReplySegment[] = [];
  const receipts = new Map<string, ReturnType<typeof messageSchema.parse>>();
  const checkpoints = new Map<string, RunCheckpoint>();
  const leases = new Map<string, number>();
  const steering = new Map<string, typeof messages>();
  const backupJobs = new Map<string, number>();
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
  function state(run: ExecutionRun) {
    publish({ kind: "run.state", runId: run.id, state: run.state, failureCode: run.failureCode });
  }
  function active(run: ExecutionRun) {
    const stored = runs.find((candidate) => candidate.id === run.id)!;
    if (
      stored.fence !== run.fence ||
      stored.ownerId !== run.ownerId ||
      (leases.get(run.id) ?? 0) <= Date.now() ||
      (stored.state !== "running" && stored.state !== "waiting")
    )
      throw new StaleRunFenceError();
    return stored;
  }
  const toolActivity = new Map<string, ToolActivity>();
  const repository: ConversationsRepository & ConversationRunRepository = {
    async setComputerInputPaused(_scope, run, paused) {
      const stored = active(run);
      stored.computerInputPaused = paused;
      stored.state = paused ? "waiting" : "running";
      Object.assign(run, { computerInputPaused: paused, state: stored.state });
      publish({
        kind: "run.state",
        runId: run.id,
        state: stored.state,
        failureCode: null,
        computerInputPaused: paused,
      });
    },
    async beginTool(_scope, run, tool) {
      active(run);
      const key = `${run.id}/${tool.toolCallId}`;
      if (toolActivity.has(key)) return;
      toolActivity.set(key, {
        runId: run.id,
        ...tool,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        outcome: null,
        durationMs: null,
        exitStatus: null,
      });
      publish({ kind: "tool.started", runId: run.id, ...tool });
    },
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
      const current = runs.find((run) => run.state === "running" || run.state === "waiting");
      if (current) {
        const pending = steering.get(current.id) ?? [];
        pending.push(message);
        steering.set(current.id, pending);
        return message;
      }
      const run: ExecutionRun = {
        ...runSchema.parse({
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
        }),
        ownerId: "",
        fence: 0,
        attemptId: "",
        attemptNumber: 0,
        timeoutAt: now(),
        connectionId: null,
        computerId: null,
        computerGeneration: null,
      };
      runs.push(run);
      backupJobs.set(run.id, Date.now() + 330_000);
      state(run);
      return message;
    },
    async claimNext(_scope, _id, options) {
      const current = runs.find((run) => run.state === "running" || run.state === "waiting");
      if (current && (leases.get(current.id) ?? 0) > Date.now()) return undefined;
      const run = current ?? runs.find((candidate) => candidate.state === "queued");
      if (!run) return undefined;
      const first = run.state === "queued";
      if (run.state === "queued") run.state = "running";
      run.ownerId = options.ownerId;
      run.fence++;
      run.attemptId = crypto.randomUUID();
      run.attemptNumber++;
      run.timeoutAt = new Date(Date.now() + options.timeoutMs).toISOString();
      leases.set(run.id, Date.now() + options.leaseMs);
      backupJobs.set(run.id, Date.now() + options.timeoutMs + options.backupMarginMs);
      if (first) state(run);
      const checkpoint = checkpoints.get(run.id) ?? {
        continuation: [],
        pendingCalls: [],
        rounds: 0,
        completed: false,
      };
      checkpoints.set(run.id, structuredClone(checkpoint));
      return {
        scope: f.scope,
        run: { ...run },
        instructions: "Be helpful",
        history: [],
        checkpoint: structuredClone(checkpoint),
      };
    },
    async executionStarted(_scope, run) {
      const stored = active(run);
      stored.startedAt ??= now();
      run.startedAt = stored.startedAt;
      return stored.startedAt;
    },
    async getRun(_scope, _id, id) {
      return runs.find((candidate) => candidate.id === id)!;
    },
    async stop(_scope, _id, id) {
      const run = runs.find((candidate) => candidate.id === id)!;
      if (run.state === "running" || run.state === "waiting" || run.state === "queued") {
        run.state = "cancelled";
        run.finishedAt = now();
        state(run);
        leases.delete(run.id);
        backupJobs.delete(run.id);
      }
      return runSchema.parse({
        id: run.id,
        spaceId: run.spaceId,
        conversationId: run.conversationId,
        agentId: run.agentId,
        trigger: run.trigger,
        messageId: run.messageId,
        memberAccountId: run.memberAccountId,
        model: run.model,
        state: run.state,
        failureCode: run.failureCode,
        createdAt: run.createdAt,
        startedAt: run.startedAt,
        firstResponseAt: run.firstResponseAt,
        finishedAt: run.finishedAt,
      });
    },
    async finish(_scope, run, failure, retryAt) {
      const stored = active(run);
      if (!failure && steering.get(run.id)?.length) return false;
      if (retryAt) {
        stored.ownerId = "";
        leases.delete(run.id);
        backupJobs.set(run.id, retryAt.getTime());
        return true;
      }
      stored.state = failure ? "failed" : "succeeded";
      stored.failureCode = failure;
      stored.finishedAt = now();
      leases.delete(run.id);
      backupJobs.delete(run.id);
      state(stored);
      return true;
    },
    async commitTurn(_scope, run, turn) {
      const stored = active(run);
      checkpoints.set(run.id, structuredClone(turn.checkpoint));
      if (!turn.text || !turn.segmentId) {
        for (const tool of turn.tools ?? []) await repository.beginTool(f.scope, run, tool);
        return false;
      }
      const segment: ReplySegment = {
        id: turn.segmentId,
        spaceId: f.spaceId,
        conversationId: f.conversationId,
        runId: run.id,
        sequence: f.log.length + 1,
        text: turn.text,
        createdAt: now(),
      };
      segments.push(segment);
      const firstResponse = !stored.firstResponseAt;
      stored.firstResponseAt ??= turn.firstResponseAt ?? now();
      publish({ kind: "reply.segment", segment });
      for (const tool of turn.tools ?? []) await repository.beginTool(f.scope, run, tool);
      return firstResponse;
    },
    async heartbeat(_scope, run, leaseMs) {
      try {
        active(run);
        leases.set(run.id, Date.now() + leaseMs);
        return true;
      } catch {
        return false;
      }
    },
    async release(_scope, run) {
      active(run);
      leases.delete(run.id);
    },
    async saveCheckpoint(_scope, run, checkpoint, tool) {
      active(run);
      checkpoints.set(run.id, structuredClone(checkpoint));
      if (tool) {
        const activity = toolActivity.get(`${run.id}/${tool.toolCallId}`)!;
        if (activity.finishedAt) return;
        activity.finishedAt = now();
        activity.durationMs = Math.max(0, Date.now() - Date.parse(activity.startedAt));
        activity.outcome = tool.outcome;
        activity.exitStatus = tool.exitStatus;
        publish({
          kind: "tool.finished",
          runId: run.id,
          toolCallId: activity.toolCallId,
          toolName: activity.toolName,
          target: activity.target,
          argumentSummary: activity.argumentSummary,
          outcome: activity.outcome,
          durationMs: activity.durationMs,
          exitStatus: activity.exitStatus,
        });
      }
    },
    async consumeSteering(_scope, run, checkpoint) {
      active(run);
      const next = structuredClone(checkpoint);
      for (const message of steering.get(run.id) ?? [])
        next.continuation.push({
          role: "user",
          content: message.text,
          timestamp: Date.parse(message.createdAt),
        });
      if (steering.get(run.id)?.length) next.completed = false;
      steering.delete(run.id);
      checkpoints.set(run.id, structuredClone(next));
      return next;
    },
    async pinResources(_scope, run, pins) {
      const stored = active(run);
      Object.assign(stored, pins);
      Object.assign(run, pins);
    },
    async scanRunnable() {
      return runs.some(
        (run) =>
          ["queued", "running", "waiting"].includes(run.state) &&
          (leases.get(run.id) ?? 0) <= Date.now(),
      )
        ? [{ scope: f.scope, id: f.conversationId }]
        : [];
    },
    async claimBackupJobs() {
      return [...backupJobs.values()].some((at) => at <= Date.now())
        ? [{ scope: f.scope, id: f.conversationId }]
        : [];
    },
    async snapshot() {
      throw new Error("Unused");
    },
  };
  const diagnostics: string[] = [];
  const runner = new ConversationRunner(
    repository,
    model.models,
    (code) => diagnostics.push(code),
    undefined,
    toolRuntime,
    { maxAttempts: 1 },
  );
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
    checkpoints,
    backupJobs,
  };
}
