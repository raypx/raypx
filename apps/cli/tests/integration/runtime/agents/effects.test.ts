import { expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite.js";
import { AgentStore } from "../../../../src/runtime/agents/store.js";
import { FakeClock } from "../../../../src/runtime/agents/domain/ports.js";
import { taskEffects } from "../../../../src/runtime/sqlite/schema.js";
import type { LiveFacts } from "../../../../src/runtime/agents/domain/commands.js";
import type { LocalAgentTask } from "../../../../src/runtime/agents/model.js";

/**
 * Effects are durable intents that commit with the decision producing them. They
 * are process-bound: recovery marks a previous process's open effects abandoned
 * instead of replaying them, and settled effects are pruned after seven days.
 */

const start = new Date("2026-01-01T00:00:00.000Z");
const binding = "relay:device";
const taskId = "00000000-0000-4000-8000-000000000030";
const requestId = "00000000-0000-4000-8000-000000000031";
const task: LocalAgentTask = {
  binding,
  sessionId: null,
  task: {
    id: taskId,
    deviceId: "00000000-0000-4000-8000-000000000032",
    projectId: "00000000-0000-4000-8000-000000000033",
    provider: "codex",
    mode: "run",
    prompt: "Task",
    status: "waiting",
    summary: "",
    parentTaskId: null,
    createdAt: start.toISOString(),
    updatedAt: start.toISOString(),
  },
};
const live: LiveFacts = {
  closing: false,
  active: () => true,
  pending: () => true,
  ready: () => true,
  queueLength: () => 0,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-effects-"));
  const clock = new FakeClock(start);
  const database = profileStorage(directory).database;
  const store = new AgentStore(database, 4096, 8 * 1024 * 1024, clock);
  store.accept(task, "00000000-0000-4000-8000-000000000034");
  store.request(binding, {
    id: requestId,
    taskId,
    kind: "permission",
    title: "Codex",
    body: "{}",
    questions: [],
    expiresAt: "2026-01-01T00:10:00.000Z",
    status: "pending",
    decision: null,
  });
  const decide = () =>
    store.submit(
      {
        type: "decision",
        binding,
        commandId: "00000000-0000-4000-8000-000000000035",
        taskId,
        requestId,
        decision: { type: "allow" },
      },
      live,
    );
  return { directory, clock, database, store, decide };
}

it("records the effect intent with the decision and settles it once run", () => {
  const f = fixture();
  try {
    const decision = f.decide();
    expect(decision.effects).toEqual([
      expect.objectContaining({ type: "provider.request.respond", effectId: expect.any(String) }),
    ]);
    // The applied request and the open intent are committed together.
    expect(f.store.getRequest(binding, requestId)?.status).toBe("applied");
    expect(f.store.effectRecords(binding, taskId)).toEqual([
      { type: "provider.request.respond", status: "open" },
    ]);
    f.store.settleEffect(decision.effects[0]!.effectId!, "done");
    expect(f.store.effectRecords(binding, taskId)).toEqual([
      { type: "provider.request.respond", status: "done" },
    ]);
  } finally {
    removeProfileDirectory(f.directory, { recursive: true, force: true });
  }
});

it("abandons a previous process's open effects instead of replaying them", () => {
  const f = fixture();
  try {
    f.decide();
    expect(f.store.recoverEffects()).toEqual([{ taskId, binding }]);
    expect(f.store.effectRecords(binding, taskId)).toEqual([
      { type: "provider.request.respond", status: "abandoned" },
    ]);
    // A second sweep finds nothing left open.
    expect(f.store.recoverEffects()).toEqual([]);
  } finally {
    removeProfileDirectory(f.directory, { recursive: true, force: true });
  }
});

it("prunes settled effects older than seven days at startup", () => {
  const f = fixture();
  try {
    const decision = f.decide();
    f.store.settleEffect(decision.effects[0]!.effectId!, "done");
    f.clock.advance(7 * 24 * 60 * 60 * 1000 - 1);
    f.store.recoverEffects();
    expect(f.database.select().from(taskEffects).all()).toHaveLength(1);
    f.clock.advance(2);
    f.store.recoverEffects();
    expect(f.database.select().from(taskEffects).all()).toHaveLength(0);
  } finally {
    removeProfileDirectory(f.directory, { recursive: true, force: true });
  }
});

it("deletes effect rows when history clearing forgets the task", () => {
  const f = fixture();
  try {
    f.decide();
    f.store.forget(binding, [taskId]);
    expect(f.store.effectRecords(binding, taskId)).toEqual([]);
  } finally {
    removeProfileDirectory(f.directory, { recursive: true, force: true });
  }
});
