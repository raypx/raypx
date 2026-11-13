import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  AiError,
  createAssistantMessageEventStream,
  type AssistantMessage,
  type ToolCall,
} from "@raypx/ai";
import { createMemoryComputerProvider } from "@raypx/providers/computer";
import type { ComputersService } from "@raypx/computers/server";
import { approvalRequestSchema, type ApprovalRequest, type Effect } from "@raypx/core/approvals";
import { createApprovalsService, type ApprovalsRepository } from "./approvals.js";
import { createComputerTools } from "./computer-tools.js";
import { computerRecord } from "../tests/support/computer-fixture.js";
import { conversationIdSchema } from "@raypx/core/agents";
import { messageSchema, runSchema, type Run, type RunFailure } from "@raypx/core/conversation";
import type { SpaceScope } from "@raypx/spaces/server";
import {
  StaleRunFenceError,
  type ConversationFanout,
  type ConversationRunRepository,
  type ConversationsRepository,
  type ExecutionRun,
  type RunCheckpoint,
  type RunClaimOptions,
} from "./conversations.js";
import { ConversationRunner, type ModelAccess, type ModelTurn, type RunTools } from "./runner.js";

const scope = {
  spaceId: "space",
  member: {
    spaceId: "space",
    accountId: "member",
    role: "owner",
    createdAt: "2026-01-01T00:00:00Z",
  },
} as SpaceScope;
const id = conversationIdSchema.parse("conversation");
const runners: ConversationRunner[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T00:00:00.000Z"));
});
afterEach(async () => {
  await Promise.all(runners.splice(0).map((executor) => executor.close()));
  vi.useRealTimers();
});
const now = () => new Date().toISOString();
const blank = (): RunCheckpoint => ({
  continuation: [],
  pendingCalls: [],
  rounds: 0,
  completed: false,
});
interface Row {
  run: Run;
  checkpoint: RunCheckpoint;
  ownerId: string | null;
  fence: number;
  leaseUntil: number;
  attempts: number;
  nextAt: number;
  connectionId: string | null;
  computerId: string | null;
  computerGeneration: number | null;
  steering: string[];
  backupAt: number | null;
}
/** In-memory transactional port; actual SQL locking/FKs are covered by the PostgreSQL suite. */
function store() {
  const rows: Row[] = [];
  const visible: string[] = [];
  const crashed = new Set<string>();
  const listeners = new Set<() => void>();
  let sequence = 0;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function owned(run: ExecutionRun) {
    const row = rows.find((candidate) => candidate.run.id === run.id)!;
    if (
      row.ownerId !== run.ownerId ||
      row.fence !== run.fence ||
      row.leaseUntil <= Date.now() ||
      !["running", "waiting"].includes(row.run.state)
    )
      throw new StaleRunFenceError();
    return row;
  }
  const repository: ConversationsRepository & ConversationRunRepository = {
    async send(_scope, conversationId, input) {
      const msg = messageSchema.parse({
        id: crypto.randomUUID(),
        spaceId: scope.spaceId,
        conversationId,
        sequence: ++sequence,
        author: { kind: "member", accountId: "member" },
        text: input.text,
        createdAt: now(),
      });
      const active = rows.find(
        (row) =>
          row.run.conversationId === conversationId &&
          ["running", "waiting"].includes(row.run.state),
      );
      if (active) active.steering.push(input.text);
      else
        rows.push({
          run: runSchema.parse({
            id: crypto.randomUUID(),
            spaceId: scope.spaceId,
            conversationId,
            agentId: conversationId,
            trigger: "message",
            messageId: msg.id,
            memberAccountId: "member",
            model: { modelId: "fixture" },
            state: "queued",
            failureCode: null,
            createdAt: now(),
            startedAt: null,
            firstResponseAt: null,
            finishedAt: null,
          }),
          checkpoint: blank(),
          ownerId: null,
          fence: 0,
          leaseUntil: 0,
          attempts: 0,
          nextAt: Date.now(),
          connectionId: null,
          computerId: null,
          computerGeneration: null,
          steering: [],
          backupAt: Date.now() + 1_030,
        });
      notify();
      return msg;
    },
    async claimNext(_scope, conversationId, options: RunClaimOptions) {
      if (crashed.has(options.ownerId)) return undefined;
      const row = rows.find(
        (candidate) =>
          candidate.run.conversationId === conversationId &&
          ["queued", "running", "waiting"].includes(candidate.run.state) &&
          candidate.nextAt <= Date.now() &&
          (!candidate.ownerId || candidate.leaseUntil <= Date.now()),
      );
      if (!row) return undefined;
      row.ownerId = options.ownerId;
      row.fence++;
      row.attempts++;
      row.leaseUntil = Date.now() + options.leaseMs;
      if (row.run.state === "queued") row.run.state = "running";
      row.backupAt = Date.now() + options.timeoutMs + options.backupMarginMs;
      const run: ExecutionRun = {
        ...structuredClone(row.run),
        ownerId: row.ownerId,
        fence: row.fence,
        attemptId: `attempt-${row.attempts}`,
        attemptNumber: row.attempts,
        timeoutAt: new Date(Date.now() + options.timeoutMs).toISOString(),
        connectionId: row.connectionId,
        computerId: row.computerId,
        computerGeneration: row.computerGeneration,
      };
      return {
        scope,
        run,
        instructions: "Be helpful",
        history: [],
        checkpoint: structuredClone(row.checkpoint),
      };
    },
    async getRun(_scope, _id, runId) {
      return structuredClone(rows.find((row) => row.run.id === runId)!.run);
    },
    async executionStarted(_scope, run) {
      const row = owned(run);
      row.run.startedAt ??= now();
      return row.run.startedAt;
    },
    async heartbeat(_scope, run, leaseMs) {
      if (crashed.has(run.ownerId)) return new Promise<boolean>(() => {});
      try {
        owned(run).leaseUntil = Date.now() + leaseMs;
        return true;
      } catch {
        return false;
      }
    },
    async release(_scope, run) {
      const row = owned(run);
      row.ownerId = null;
      row.leaseUntil = 0;
      notify();
    },
    async scanRunnable() {
      return rows
        .filter(
          (row) =>
            ["queued", "running", "waiting"].includes(row.run.state) &&
            row.nextAt <= Date.now() &&
            (!row.ownerId || row.leaseUntil <= Date.now()),
        )
        .map((row) => ({ scope, id: row.run.conversationId }));
    },
    async claimBackupJobs(_owner, leaseMs) {
      return rows
        .filter((row) => row.backupAt !== null && row.backupAt <= Date.now())
        .map((row) => {
          row.backupAt = Date.now() + leaseMs;
          return { scope, id: row.run.conversationId };
        });
    },
    async finish(_scope, run, failure: RunFailure | null, retryAt) {
      const row = owned(run);
      if (!failure && row.steering.length) return false;
      row.ownerId = null;
      row.leaseUntil = 0;
      if (retryAt) {
        row.run.state = "queued";
        row.run.failureCode = null;
        row.nextAt = retryAt.getTime();
        row.backupAt = retryAt.getTime();
      } else {
        row.run.state = failure ? "failed" : "succeeded";
        row.run.failureCode = failure;
        row.run.finishedAt = now();
        row.backupAt = null;
      }
      notify();
      return true;
    },
    async commitTurn(_scope, run, turn) {
      const row = owned(run);
      row.checkpoint = structuredClone(turn.checkpoint);
      const first = !!turn.text && !row.run.firstResponseAt;
      if (turn.text) {
        visible.push(turn.text);
        row.run.firstResponseAt ??= turn.firstResponseAt!;
      }
      return first;
    },
    async saveCheckpoint(_scope, run, checkpoint) {
      owned(run).checkpoint = structuredClone(checkpoint);
    },
    async consumeSteering(_scope, run, checkpoint) {
      const row = owned(run);
      const result = structuredClone(checkpoint);
      for (const text of row.steering)
        result.continuation.push({ role: "user", content: text, timestamp: Date.now() });
      if (row.steering.length) result.completed = false;
      row.steering = [];
      row.checkpoint = structuredClone(result);
      return result;
    },
    async pinResources(_scope, run, pins) {
      const row = owned(run);
      if (pins.connectionId) row.connectionId = pins.connectionId;
      if (pins.computerId) row.computerId = pins.computerId;
      if (pins.computerGeneration) row.computerGeneration = pins.computerGeneration;
    },
    async stop(_scope, _id, runId) {
      const row = rows.find((candidate) => candidate.run.id === runId)!;
      row.run.state = "cancelled";
      row.run.finishedAt = now();
      row.ownerId = null;
      row.backupAt = null;
      return structuredClone(row.run);
    },
    async events() {
      return { status: "events", events: [], cursor: 0, hasMore: false };
    },
    async snapshot() {
      throw new Error("Not used");
    },
    async retainAfter() {},
  };
  const fanout: ConversationFanout = {
    async subscribe(listener) {
      const changed = () => listener({ conversationId: id, sequence });
      listeners.add(changed);
      return async () => {
        listeners.delete(changed);
      };
    },
    async close() {
      listeners.clear();
    },
  };
  return { rows, visible, repository, crashed, fanout, owned };
}
function model() {
  const calls: Array<{
    input: ModelTurn;
    signal: AbortSignal;
    complete(text?: string, tools?: ToolCall[]): void;
    fail(error: AiError): void;
  }> = [];
  let missing = false;
  const models: ModelAccess = {
    async resolve() {
      if (missing) throw new AiError("AI_MODEL_NOT_FOUND");
      return {
        connectionId: "fixture-connection",
        stream(input, signal) {
          const stream = createAssistantMessageEventStream();
          const result = (text: string, tools: ToolCall[] = []): AssistantMessage => ({
            role: "assistant",
            content: [...(text ? [{ type: "text" as const, text }] : []), ...tools],
            api: "openai-responses",
            provider: "fixture",
            model: "fixture",
            stopReason: tools.length ? "toolUse" : "stop",
            timestamp: Date.now(),
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
          });
          let rejected: AiError | undefined;
          calls.push({
            input: structuredClone(input),
            signal,
            complete(text = "", tools = []) {
              stream.end(result(text, tools));
            },
            fail(error) {
              rejected = error;
              stream.end(result(""));
            },
          });
          return {
            async *[Symbol.asyncIterator]() {
              for await (const event of stream) yield event;
              if (rejected) throw rejected;
            },
            result: () => stream.result(),
          };
        },
      };
    },
    close() {},
  };
  return {
    calls,
    models,
    remove: () => {
      missing = true;
    },
  };
}
function runner(db: ReturnType<typeof store>, models: ModelAccess, tools?: RunTools, options = {}) {
  const value = new ConversationRunner(db.repository, models, undefined, undefined, tools, {
    leaseMs: 30,
    heartbeatMs: 10,
    scanIntervalMs: 10,
    attemptTimeoutMs: 1_000,
    backupMarginMs: 30,
    ...options,
  });
  runners.push(value);
  return value;
}
const send = (value: ConversationRunner, text = "Start", conversationId = id) =>
  value.conversations.send(scope, conversationId, { idempotencyKey: crypto.randomUUID(), text });
const advance = (ms = 1) => vi.advanceTimersByTimeAsync(ms);

it("claims shared work once across two executors and deletes its backup after success", async () => {
  const db = store();
  const a = model();
  const b = model();
  const first = runner(db, a.models);
  const second = runner(db, b.models);
  await send(first);
  await second.startWorker();
  await advance();
  expect(a.calls.length + b.calls.length).toBe(1);
  expect(db.rows[0]!.attempts).toBe(1);
  (a.calls[0] ?? b.calls[0])!.complete("One reply");
  await advance();
  expect(db.visible).toEqual(["One reply"]);
  expect(db.rows[0]!.run.state).toBe("succeeded");
  expect(db.rows[0]!.backupAt).toBeNull();
});

it("resumes a terminal checkpoint after the owner disappears without repeating visible output", async () => {
  const db = store();
  const firstModel = model();
  const recoveredModel = model();
  const first = runner(db, firstModel.models);
  const second = runner(db, recoveredModel.models);
  await send(first);
  await advance();
  const originalFinish = db.repository.finish;
  let thaw!: () => void;
  const frozen = new Promise<void>((resolve) => {
    thaw = resolve;
  });
  db.repository.finish = async (...args) => {
    if (args[1].ownerId === first.ownerId) await frozen;
    return originalFinish(...args);
  };
  firstModel.calls[0]!.complete("Committed before the crash");
  await advance();
  expect(db.visible).toEqual(["Committed before the crash"]);
  db.crashed.add(first.ownerId);
  await second.startWorker();
  await advance(40);
  expect(db.rows[0]!.attempts).toBe(2);
  expect(db.rows[0]!.run.state).toBe("succeeded");
  expect(recoveredModel.calls).toHaveLength(0);
  expect(db.visible).toEqual(["Committed before the crash"]);
  thaw();
  await advance();
  db.repository.finish = originalFinish;
});

it("graceful handover releases immediately and a worker resumes before lease expiry", async () => {
  const db = store();
  const a = model();
  const b = model();
  const first = runner(db, a.models);
  const second = runner(db, b.models);
  await send(first);
  await advance();
  await second.startWorker(db.fanout);
  await first.close();
  expect(a.calls[0]!.signal.reason).toBe("handover");
  await advance();
  expect(b.calls).toHaveLength(1);
  expect(db.rows[0]!.attempts).toBe(2);
  b.calls[0]!.complete("Resumed");
  await advance();
  expect(db.rows[0]!.run.state).toBe("succeeded");
});

it("delivers steering at the boundary and never creates a second Run", async () => {
  const db = store();
  const m = model();
  const r = runner(db, m.models);
  await send(r);
  await advance();
  await send(r, "Use the revised instructions");
  m.calls[0]!.complete("First answer");
  await advance();
  expect(db.rows).toHaveLength(1);
  expect(m.calls).toHaveLength(2);
  expect(m.calls[1]!.input.continuation).toContainEqual({
    role: "user",
    content: "Use the revised instructions",
    timestamp: expect.any(Number),
  });
  m.calls[1]!.complete("Steered answer");
  await advance();
  expect(db.visible).toEqual(["First answer", "Steered answer"]);
});

it("does not let a stuck conversation delay an independent Run", async () => {
  const db = store();
  const m = model();
  const r = runner(db, m.models);
  await send(r);
  await advance();
  await send(r, "Independent", conversationIdSchema.parse("another-conversation"));
  await advance();
  expect(m.calls).toHaveLength(2);
  m.calls[1]!.complete("Second Run finishes first");
  await advance();
  expect(db.rows.map((row) => row.run.state)).toEqual(["running", "succeeded"]);
});

it("reschedules a clean transient failure at provider retry-after and retries directly", async () => {
  const db = store();
  const m = model();
  const r = runner(db, m.models);
  await send(r);
  await advance();
  m.calls[0]!.fail(new AiError("AI_RATE_LIMITED", Date.now() + 75));
  await advance();
  const due = db.rows[0]!.backupAt;
  expect(db.rows[0]!.run.state).toBe("queued");
  expect(due).toBe(Date.now() + 74);
  await advance(75);
  expect(m.calls).toHaveLength(2);
  m.calls[1]!.complete("Retried");
  await advance();
  expect(db.rows[0]!.backupAt).toBeNull();
});

it("fails a resumed Run explicitly when its pinned model has disappeared", async () => {
  const db = store();
  const a = model();
  const b = model();
  const first = runner(db, a.models);
  const second = runner(db, b.models);
  await send(first);
  await advance();
  await first.close();
  b.remove();
  await second.startWorker();
  await advance();
  expect(db.rows[0]!.run).toMatchObject({ state: "failed", failureCode: "MODEL_UNAVAILABLE" });
});

it("stop aborts the attempt and records cancellation while late model output is discarded", async () => {
  const db = store();
  const m = model();
  const r = runner(db, m.models);
  await send(r);
  await advance();
  await r.conversations.stop(scope, id, db.rows[0]!.run.id);
  m.calls[0]!.complete("Late output");
  await advance();
  expect(db.rows[0]!.run.state).toBe("cancelled");
  expect(m.calls[0]!.signal.reason).toBe("cancelled");
  expect(db.visible).toEqual([]);
});

async function toolFixture(db: ReturnType<typeof store>, mode: "ask" | "never" = "never") {
  const provider = createMemoryComputerProvider();
  const computer = { ...computerRecord("running"), spaceId: scope.spaceId };
  const ref = { id: computer.id, generation: computer.generation };
  await provider.provision(ref);
  const writes = vi.spyOn(provider, "write");
  const computers: ComputersService = {
    get: async () => ({ status: "available", computer }),
    start: async () => ({ status: "available", computer }),
    stop: async () => ({ status: "available", computer }),
  };
  const requests = new Map<string, ApprovalRequest>();
  const effects = new Map<string, Effect>();
  const repository: ApprovalsRepository = {
    async getSettings() {
      return { mode, rules: [] };
    },
    async updateSettings(_account, value) {
      return value;
    },
    async listPending() {
      return [...requests.values()].filter((request) => request.state === "pending");
    },
    async answer(_scope, requestId, answer) {
      const request = requests.get(requestId)!;
      request.state = answer.decision;
      request.resolvedAt = now();
      request.answeredByAccountId = "member";
      db.rows[0]!.run.state = "running";
      return structuredClone(request);
    },
    async createRequest(_scope, run, call, expiresAt, createdAt) {
      db.owned(run);
      const existing = [...requests.values()].find((request) => request.toolCallId === call.id);
      if (existing) return structuredClone(existing);
      const request = approvalRequestSchema.parse({
        id: crypto.randomUUID(),
        spaceId: scope.spaceId,
        conversationId: id,
        runId: run.id,
        memberAccountId: "member",
        toolCallId: call.id,
        toolName: call.name,
        arguments: call.arguments,
        argumentSummary: call.argumentSummary,
        target: call.target,
        state: "pending",
        expiresAt: expiresAt.toISOString(),
        createdAt: createdAt.toISOString(),
        resolvedAt: null,
        answeredByAccountId: null,
      });
      requests.set(request.id, request);
      db.rows[0]!.run.state = "waiting";
      return structuredClone(request);
    },
    async pollRequest(_scope, run, requestId) {
      db.owned(run);
      return structuredClone(requests.get(requestId)!);
    },
    async cancelRequest(_scope, run, requestId) {
      db.owned(run);
      requests.get(requestId)!.state = "cancelled";
    },
    async listEffects() {
      return [...effects.values()].map((effect) => structuredClone(effect));
    },
    async beginEffect(_scope, run, effect) {
      db.owned(run);
      const existing = effects.get(effect.key);
      if (existing) return { created: false, effect: structuredClone(existing) };
      effects.set(effect.key, structuredClone(effect));
      return { created: true, effect };
    },
    async completeEffect(_scope, effectKey, state, result, completedAt, run) {
      db.owned(run);
      const effect = effects.get(effectKey)!;
      effect.state = state;
      effect.result = result;
      effect.completedAt = completedAt.toISOString();
    },
  };
  const approvals = createApprovalsService(repository, { pollIntervalMs: 1 });
  const tools = () => createComputerTools(computers, provider, [], db.repository.pinResources);
  return { tools, approvals, requests, effects, writes, provider, ref };
}
const writeCall: ToolCall = {
  type: "toolCall",
  id: "write-1",
  name: "computer_write_file",
  arguments: { path: "note.txt", content: "Recorded once" },
};

it("resumes a waiting approval, preserves its card and delivers waiting steering to the next turn", async () => {
  const db = store();
  const tools = await toolFixture(db, "ask");
  const a = model();
  const b = model();
  const first = runner(db, a.models, { tools: tools.tools(), approvals: tools.approvals });
  const second = runner(db, b.models, { tools: tools.tools(), approvals: tools.approvals });
  await send(first);
  await advance();
  a.calls[0]!.complete("Proposing a write", [writeCall]);
  await advance();
  expect(db.rows[0]!.run.state).toBe("waiting");
  const requestId = [...tools.requests.keys()][0]!;
  await send(first, "Keep this instruction after restart");
  await first.close();
  expect(tools.requests.get(requestId)!.state).toBe("pending");
  await second.startWorker();
  await advance();
  await tools.approvals.answer(scope, requestId, { decision: "approved" });
  await vi.waitFor(() => expect(b.calls).toHaveLength(1), { interval: 1 });
  expect(JSON.stringify(b.calls[0]!.input.continuation)).toContain(
    "Keep this instruction after restart",
  );
  expect(db.rows).toHaveLength(1);
  expect(tools.requests.size).toBe(1);
  b.calls[0]!.complete("Completed after approval");
  await advance();
  expect(db.rows[0]!.run.state).toBe("succeeded");
  expect(tools.writes).toHaveBeenCalledTimes(1);
});

it("reuses a recorded effect after a crash between the outcome and tool checkpoint", async () => {
  const db = store();
  const tools = await toolFixture(db);
  const a = model();
  const b = model();
  const first = runner(db, a.models, { tools: tools.tools(), approvals: tools.approvals });
  const second = runner(db, b.models, { tools: tools.tools(), approvals: tools.approvals });
  const save = db.repository.saveCheckpoint;
  let thaw!: () => void;
  const frozen = new Promise<void>((resolve) => {
    thaw = resolve;
  });
  db.repository.saveCheckpoint = async (...args) => {
    if (args[1].ownerId === first.ownerId) await frozen;
    return save(...args);
  };
  await send(first);
  await advance();
  a.calls[0]!.complete("One committed turn", [writeCall]);
  await vi.waitFor(() => expect(tools.writes).toHaveBeenCalledTimes(1), { interval: 1 });
  await vi.waitFor(() => expect([...tools.effects.values()][0]!.state).toBe("succeeded"), {
    interval: 1,
  });
  expect([...tools.effects.values()][0]!.state).toBe("succeeded");
  expect(db.rows[0]!.checkpoint.pendingCalls).toHaveLength(1);
  db.crashed.add(first.ownerId);
  await second.startWorker();
  await advance(40);
  await vi.waitFor(() => expect(b.calls).toHaveLength(1), { interval: 1 });
  expect(tools.writes).toHaveBeenCalledTimes(1);
  b.calls[0]!.complete("Recovered without another write");
  await advance();
  expect(db.rows[0]!.run.state).toBe("succeeded");
  expect(db.visible).toEqual(["One committed turn", "Recovered without another write"]);
  thaw();
  await advance();
});

it("uses a due backup to recover a crash even when the regular scan misses it", async () => {
  const db = store();
  const a = model();
  const b = model();
  const first = runner(db, a.models, undefined, { attemptTimeoutMs: 100 });
  const second = runner(db, b.models, undefined, { attemptTimeoutMs: 100 });
  await send(first);
  await advance();
  db.crashed.add(first.ownerId);
  db.repository.scanRunnable = async () => [];
  await second.startWorker();
  await advance(120);
  expect(b.calls).toHaveLength(0);
  await advance(20);
  expect(b.calls).toHaveLength(1);
  b.calls[0]!.complete("Backup recovery");
  await advance();
  expect(db.rows[0]!.run.state).toBe("succeeded");
  expect(db.rows[0]!.backupAt).toBeNull();
});
