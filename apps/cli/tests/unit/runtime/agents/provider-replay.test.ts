import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vite-plus/test";
import type { AgentProvider, HumanRequest, TaskActivity } from "@raypx/contracts/tasks";
import {
  ManagedExecution,
  type ExecutionStore,
} from "../../../../src/runtime/agents/harness/execution";
import { CodexProvider } from "../../../../src/runtime/agents/harness/providers/codex";
import { createDriver } from "../../../../src/runtime/agents/harness/registry";
import { ConversationRecorder } from "../../../../src/runtime/agents/activity";
import type { LocalAgentTask } from "../../../../src/runtime/agents/store";
import {
  parseProviderReplay,
  ProviderReplay,
  type ReplayRecord,
} from "../../../helpers/provider-replay";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function recording(provider: AgentProvider) {
  return parseProviderReplay(
    readFileSync(
      new URL(`../../../fixtures/agents/replay/${provider}.ndjson`, import.meta.url),
      "utf8",
    ),
  );
}
function bootstrap(provider: AgentProvider) {
  const records = recording(provider);
  return records.slice(
    0,
    records.findIndex((record) => record.direction === "gate" && record.name === "started") + 1,
  );
}
function late(provider: AgentProvider): ReplayRecord {
  return {
    direction: "provider",
    message:
      provider === "codex"
        ? { method: "item/agentMessage/delta", params: { delta: "Stale synthetic output" } }
        : { type: "system", session_id: "stale-session" },
  };
}
function fixture(provider: AgentProvider, records = recording(provider)) {
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
    put: vi.fn(),
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
    }),
    requests: vi.fn(() => [...requests.values()]),
  };
  const conversation = new ConversationRecorder(id, (entry) =>
    store.recordActivity(local.binding, entry),
  );
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
    10_000,
    (name, start, ports) => createDriver(name, start, ports, replay.factory),
  );
  const running = execution.run(provider, "/synthetic-project");
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

it("validates replay records and reports directional mismatches without exposing payloads", async () => {
  expect(() => parseProviderReplay('{"direction":"provider","message":{},"extra":true}')).toThrow(
    "line 1",
  );
  expect(() => parseProviderReplay('{"direction":"exit","code":"bad"}')).toThrow("line 1");
  const replay = new ProviderReplay([
    { direction: "host", channel: "request", method: "expected" },
  ]);
  replay.factory("synthetic", [], "/synthetic", () => {});
  await expect(
    replay.process.request("other", { secret: "synthetic-private-text" }),
  ).rejects.toThrow("record 1");
  await expect(replay.drain()).rejects.toThrow("Provider replay mismatch at record 1");
});

it.each(["codex", "claude"] as const)(
  "replays %s resume and a durable queued turn, retaining the lock through drain",
  async (provider) => {
    const f = fixture(provider);
    await f.replay.wait("started");
    await f.running;
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(provider !== "claude" || f.replay.launches[0]!.args.includes("--resume")).toBe(true);
    const input = f.execution.enqueue({
      id: crypto.randomUUID(),
      mode: "queue",
      prompt: "Queued synthetic input",
    });
    expect(input.status).toBe("queued");
    f.replay.release("started");
    await f.replay.wait("queued");
    await f.waitActivity(input.id, "sent");
    expect(f.inputStatus(input.id)).toBe("sent");
    expect(f.unlock).not.toHaveBeenCalled();
    f.replay.release("queued");
    await f.replay.wait("draining");
    const drained = vi.fn();
    void f.replay.drain().then(drained);
    expect(f.unlock).not.toHaveBeenCalled();
    expect(drained).not.toHaveBeenCalled();
    f.replay.release("draining");
    await f.finished();
    expect(f.local.task.status).toBe("succeeded");
    expect(f.unlock).toHaveBeenCalledTimes(1);
    expect(f.ended).toHaveBeenCalledTimes(1);
  },
);

it.each(["codex", "claude"] as const)(
  "arbitrates %s approval once and ignores late events and decisions after cancellation",
  async (provider) => {
    const records: ReplayRecord[] = [
      ...bootstrap(provider),
      { direction: "host", channel: "kill" },
      late(provider),
      { direction: "gate", name: "draining" },
      { direction: "exit", code: 0 },
      late(provider),
    ];
    const f = fixture(provider, records);
    await f.replay.wait("started");
    await f.running;
    const answer = f.execution.ask("permission", "Synthetic permission", "Synthetic command");
    const request = [...f.requests.values()][0]!;
    f.execution.applyDecision(request.id, { type: "allow" });
    f.execution.applyDecision(request.id, { type: "deny", note: "Competing answer" });
    expect(await answer).toEqual({ type: "allow" });
    expect(f.requests.get(request.id)?.decision).toEqual({ type: "allow" });
    const pending = f.execution.ask("permission", "Pending permission", "Synthetic command");
    const pendingRequest = [...f.requests.values()].at(-1)!;
    f.execution.cancel();
    f.execution.applyDecision(pendingRequest.id, { type: "allow" });
    expect(await pending).toEqual({ type: "deny", note: "Task stopped" });
    f.replay.release("started");
    await f.replay.wait("draining");
    expect(f.unlock).not.toHaveBeenCalled();
    f.replay.release("draining");
    await f.finished();
    expect(f.local.task.status).toBe("cancelled");
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(
      [...f.activity.values()].some(
        (entry) => entry.kind === "message" && entry.text.includes("Stale"),
      ),
    ).toBe(false);
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);

it.each(["codex", "claude"] as const)(
  "settles %s unexpected process exit once and fences subsequent protocol output",
  async (provider) => {
    const f = fixture(provider, [
      ...bootstrap(provider),
      { direction: "exit", code: 1 },
      { direction: "host", channel: "kill" },
      late(provider),
    ]);
    await f.replay.wait("started");
    await f.running;
    f.replay.release("started");
    await f.finished();
    expect(f.local.task.status).toBe("failed");
    expect(f.local.task.summary).toBe("AGENT_EXITED");
    expect(f.local.sessionId).toBe("synthetic-session");
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);

it.each(["codex", "claude"] as const)(
  "keeps %s steer delivery faithful to its protocol",
  async (provider) => {
    const interrupt: ReplayRecord[] =
      provider === "codex"
        ? [
            {
              direction: "host",
              channel: "request",
              method: "turn/steer",
              message: {
                threadId: "synthetic-session",
                expectedTurnId: "synthetic-turn-1",
                input: [{ type: "text", text: "Steered synthetic input" }],
              },
            },
            { direction: "gate", name: "steered" },
            {
              direction: "provider",
              message: {
                method: "turn/completed",
                params: { turn: { id: "synthetic-turn-1", status: "completed" } },
              },
            },
          ]
        : [
            { direction: "host", channel: "control", message: { subtype: "interrupt" } },
            { direction: "gate", name: "interrupted" },
            {
              direction: "provider",
              message: { type: "result", is_error: true, result: "Synthetic interrupted result" },
            },
            {
              direction: "host",
              channel: "send",
              message: {
                type: "user",
                session_id: "synthetic-session",
                message: { content: "Steered synthetic input" },
              },
            },
            { direction: "gate", name: "steered" },
            {
              direction: "provider",
              message: { type: "result", result: "Synthetic steered result" },
            },
          ];
    const f = fixture(provider, [
      ...bootstrap(provider),
      ...interrupt,
      { direction: "host", channel: "kill" },
      { direction: "exit", code: 0 },
    ]);
    await f.replay.wait("started");
    await f.running;
    const input = f.execution.enqueue({
      id: crypto.randomUUID(),
      mode: "steer",
      prompt: "Steered synthetic input",
    });
    f.replay.release("started");
    await f.replay.wait(provider === "claude" ? "interrupted" : "steered");
    if (provider === "codex") await f.waitActivity(input.id, "sent");
    expect(f.inputStatus(input.id)).toBe(provider === "claude" ? "sending" : "sent");
    expect(f.replay.sent.filter((call) => call.channel === "send")).toHaveLength(1);
    if (provider === "claude") f.replay.release("interrupted");
    await f.replay.wait("steered");
    await f.waitActivity(input.id, "sent");
    f.replay.release("steered");
    await f.finished();
    expect(f.local.task.status).toBe("succeeded");
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);

it("keeps drain pending for queued protocol operations and tracked asynchronous delivery", async () => {
  const replay = new ProviderReplay([
    { direction: "gate", name: "release" },
    { direction: "host", channel: "request", method: "synthetic" },
  ]);
  replay.factory("synthetic", [], "/synthetic", () => {});
  let finish!: () => void;
  const delivery = replay.track(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const request = replay.process.request("synthetic", {}),
    drained = vi.fn();
  const drain = replay.drain().then(drained);
  expect(replay.pending).toMatchObject({ queued: 1, inFlight: 1 });
  replay.release("release");
  await request;
  expect(drained).not.toHaveBeenCalled();
  finish();
  await delivery;
  await drain;
  expect(replay.pending).toEqual({ queued: 0, inFlight: 0, remaining: 0 });
});

it.each(["item/commandExecution/requestApproval", "item/tool/requestUserInput"])(
  "fences a late %s reply after its process owner is cancelled",
  async (method) => {
    const replay = new ProviderReplay([
      { direction: "provider", message: { id: 1, method, params: {} } },
      { direction: "gate", name: "approval" },
      { direction: "exit", code: 0 },
    ]);
    let current = true,
      resolve!: (value: { type: "allow" }) => void;
    const answer = replay.track(
      new Promise<{ type: "allow" }>((done) => {
        resolve = done;
      }),
    );
    const failed = vi.fn();
    const provider = new CodexProvider(
      "codex",
      "/synthetic-project",
      {
        current: () => current,
        record: vi.fn(),
        ask: () => answer,
        completed: vi.fn(),
        failed,
        turnId: vi.fn(),
      },
      replay.factory,
    );
    await replay.wait("approval");
    current = false;
    resolve({ type: "allow" });
    await answer;
    replay.release("approval");
    await replay.drain();
    expect(provider.process).toBe(replay.process);
    expect(replay.sent).toEqual([]);
    expect(failed).not.toHaveBeenCalled();
  },
);
