import type { SessionFactory } from "@raypx/providers/core";
import { readFileSync } from "node:fs";
import { afterEach, vi } from "vitest";

import type { AgentProvider, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import { ManagedExecution } from "../../src/runtime/agents/harness/execution.js";
import type {
  ExecutionConversation,
  ExecutionStore,
} from "../../src/runtime/agents/harness/ports.js";
import { createAdapter } from "../../src/runtime/agents/infrastructure/providers/process.js";
import { ConversationRecorder } from "../../src/runtime/agents/activity.js";
import type { LocalAgentTask } from "../../src/runtime/agents/model.js";
import { parseProviderReplay, ProviderReplay, type ReplayRecord } from "./provider-replay.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function recording(provider: AgentProvider) {
  return parseProviderReplay(
    readFileSync(new URL(`../fixtures/agents/replay/${provider}.ndjson`, import.meta.url), "utf8"),
  );
}
export function bootstrap(provider: AgentProvider) {
  const records = recording(provider);
  return records.slice(
    0,
    records.findIndex((record) => record.direction === "gate" && record.name === "started") + 1,
  );
}
export function late(provider: AgentProvider): ReplayRecord {
  return {
    direction: "provider",
    message:
      provider === "codex"
        ? { method: "item/agentMessage/delta", params: { delta: "Stale synthetic output" } }
        : { type: "system", session_id: "stale-session" },
  };
}
export function memoryConversation() {
  return {
    record: vi.fn<ExecutionConversation["record"]>(),
    setTokenBaseline: vi.fn<ExecutionConversation["setTokenBaseline"]>(),
    setTurnId: vi.fn<ExecutionConversation["setTurnId"]>(),
    startTurn: vi.fn<ExecutionConversation["startTurn"]>(),
    endTurn: vi.fn<ExecutionConversation["endTurn"]>(),
    stop: vi.fn<ExecutionConversation["stop"]>(),
  } satisfies ExecutionConversation;
}
export function fixture(
  provider: AgentProvider,
  records = recording(provider),
  options: { factory?: SessionFactory; conversation?: ExecutionConversation } = {},
) {
  const replay = new ProviderReplay(records),
    id = crypto.randomUUID();
  const local: LocalAgentTask = {
    binding: "desktop:synthetic",
    sessionId: "synthetic-session",
    task: {
      id,
      deviceId: id,
      projectId: id,
      provider,
      mode: "run",
      prompt: "Synthetic initial input",
      status: "running",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  const requests = new Map<string, HumanRequest>(),
    activity = new Map<string, TaskActivity>();
  const activityWaiters: { id: string; status: string; resolve(): void }[] = [];
  const inputStatus = (inputId: string) => {
    const entry = activity.get(inputId);
    return entry?.kind === "input" ? entry.status : undefined;
  };
  const waitActivity = (inputId: string, status: string) =>
    inputStatus(inputId) === status
      ? Promise.resolve()
      : new Promise<void>((resolve) => activityWaiters.push({ id: inputId, status, resolve }));
  const store: ExecutionStore = {
    get: vi.fn(() => local),
    put: vi.fn(() => undefined),
    tokenUsage: vi.fn(() => undefined),
    recordActivity: vi.fn((_binding, entry) => {
      const value = {
        ...entry,
        order: activity.size + 1,
        revision: (activity.get(entry.id)?.revision ?? 0) + 1,
      } as TaskActivity;
      activity.set(value.id, value);
      for (const waiter of activityWaiters)
        if (waiter.id === value.id && value.kind === "input" && waiter.status === value.status)
          waiter.resolve();
      return value;
    }),
    request: vi.fn((_binding, request) => {
      requests.set(request.id, request);
      return undefined;
    }),
    getRequest: vi.fn((_binding, requestId) => requests.get(requestId)),
  };
  const conversation =
    options.conversation ??
    new ConversationRecorder(id, (entry) => store.recordActivity(local.binding, entry));
  const unlock = vi.fn(),
    ended = vi.fn();
  const completions: Promise<void>[] = [];
  const execution = new ManagedExecution(
    local,
    conversation,
    unlock,
    store,
    {
      status: (status, summary) => {
        local.task.status = status;
        if (summary !== undefined) local.task.summary = summary;
      },
      changed: vi.fn(),
      resolved: vi.fn(),
      hook: () => ({ url: "http://127.0.0.1/synthetic", token: "synthetic-hook-token" }),
      environment: () => ({}),
      track: (promise) => {
        completions.push(promise);
      },
      ended,
    },
    options.factory ??
      ((start, ports) =>
        createAdapter(provider, { ...start, executable: provider }, ports, replay.factory)),
    10_000,
  );
  const running = execution.run("/synthetic-project");
  async function finished() {
    await replay.drain();
    await Promise.all(completions);
  }
  cleanups.push(async () => {
    execution.cancel();
    // Every lifecycle tape must explicitly provide its process drain and exit.
    for (const record of records) if (record.direction === "gate") replay.release(record.name);
    await running.catch(() => {});
    await finished();
  });
  return {
    execution,
    replay,
    local,
    store,
    requests,
    activity,
    unlock,
    ended,
    running,
    finished,
    conversation,
    waitActivity,
    inputStatus,
  };
}
