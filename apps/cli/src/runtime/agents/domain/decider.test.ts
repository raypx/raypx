import { expect, it } from "vite-plus/test";
import { decide, DecisionRejected, type DecideState } from "./decider.js";
import { FakeIds } from "./ports.js";
import type { LiveFacts } from "./commands.js";
import type { LocalAgentTask } from "./state.js";

const at = "2026-01-01T00:00:00.000Z";
const taskId = "00000000-0000-4000-8000-000000000020";
const requestId = "00000000-0000-4000-8000-000000000021";
const facts = () => {
  const ids = new FakeIds();
  return { nextId: () => ids.generate(), now: () => at };
};
const live = (overrides: Partial<LiveFacts> = {}): LiveFacts => ({
  closing: false,
  active: () => true,
  pending: () => true,
  ready: () => true,
  queueLength: () => 0,
  ...overrides,
});
const local = (status: LocalAgentTask["task"]["status"]): LocalAgentTask => ({
  binding: "relay:device",
  sessionId: null,
  task: {
    id: taskId,
    deviceId: "00000000-0000-4000-8000-000000000022",
    projectId: "00000000-0000-4000-8000-000000000023",
    provider: "codex",
    mode: "run",
    prompt: "Task",
    status,
    summary: "",
    parentTaskId: null,
    createdAt: at,
    updatedAt: at,
  },
});
const request = {
  id: requestId,
  taskId,
  kind: "permission" as const,
  title: "Codex",
  body: "{}",
  questions: [],
  expiresAt: "2026-01-01T00:10:00.000Z",
  status: "pending" as const,
  decision: null,
};
const state = (overrides: Partial<DecideState> = {}): DecideState => ({
  binding: "relay:device",
  task: local("waiting"),
  requests: [request],
  activity: [],
  live: live(),
  ...overrides,
});
const decision = {
  type: "decision" as const,
  binding: "relay:device",
  commandId: "00000000-0000-4000-8000-000000000024",
  taskId,
  requestId,
  decision: { type: "allow" as const },
};

it("applies a decision before the provider is answered", () => {
  const result = decide(state(), decision, facts());
  expect(result.events.map((event) => event.type)).toEqual(["request.applied"]);
  expect(result.effects).toEqual([
    expect.objectContaining({ type: "provider.request.respond", requestId }),
  ]);
  expect(result.result).toMatchObject({ status: "applied", decision: { type: "allow" } });
});

it("records the decided state first for relay and local commands", () => {
  const result = decide(state(), { ...decision, recordDecided: true }, facts());
  expect(result.events.map((event) => event.type)).toEqual(["request.decided", "request.applied"]);
});

it("rejects decisions the committed records or live facts no longer allow", () => {
  const code = (value: DecideState, command = decision) => {
    try {
      decide(value, command, facts());
    } catch (error) {
      if (error instanceof DecisionRejected) return error.code;
      throw error;
    }
    return undefined;
  };
  expect(code(state({ requests: [] }))).toBe("NOT_FOUND");
  expect(code(state({ requests: [{ ...request, status: "expired" }] }))).toBe("REQUEST_EXPIRED");
  expect(
    code(
      state({
        requests: [{ ...request, status: "applied", decision: { type: "deny", note: "No" } }],
      }),
    ),
  ).toBe("ALREADY_RESOLVED");
  expect(code(state({ task: local("cancelling") }))).toBe("REQUEST_CLOSED");
  expect(code(state({ live: live({ pending: () => false }) }))).toBe("REQUEST_CLOSED");
  expect(code(state({ requests: [{ ...request, expiresAt: at }] }))).toBe("REQUEST_EXPIRED");
  expect(code(state(), { ...decision, decision: { type: "answer", answers: {} } as never })).toBe(
    "INVALID_ANSWER",
  );
});

it("returns the stored request for an identical retried decision, without an effect", () => {
  const applied = { ...request, status: "applied" as const, decision: { type: "allow" as const } };
  const result = decide(state({ requests: [applied] }), decision, facts());
  expect(result.events).toEqual([]);
  expect(result.effects).toEqual([]);
  expect(result.result).toEqual(applied);
});

it("commits cancelling with a cancel effect, and settles open work", () => {
  const result = decide(
    state({ task: local("running") }),
    { type: "cancel", binding: "relay:device", commandId: decision.commandId, taskId },
    facts(),
  );
  expect(result.events[0]).toMatchObject({
    type: "task.statusChanged",
    task: { status: "cancelling" },
  });
  expect(result.effects).toEqual([expect.objectContaining({ type: "execution.cancel", taskId })]);
  // A finished task has nothing left to cancel.
  expect(
    decide(
      state({ task: local("succeeded") }),
      { type: "cancel", binding: "relay:device", commandId: decision.commandId, taskId },
      facts(),
    ).effects,
  ).toEqual([]);
});

it("refuses to start while the host is closing", () => {
  expect(() =>
    decide(
      state({ task: undefined, live: live({ closing: true, active: () => false }) }),
      {
        type: "start",
        binding: "relay:device",
        commandId: decision.commandId,
        task: local("pending").task,
        deadline: at,
      },
      facts(),
    ),
  ).toThrow(DecisionRejected);
});
