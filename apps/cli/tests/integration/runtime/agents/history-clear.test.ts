import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import type { RelayCommand } from "@raypx/contracts/tasks";
import type { AgentTask, HumanRequest, TaskContextSnapshot } from "@raypx/core/tasks";
import { AgentRuntime } from "../../../../src/runtime/agents";
import { AgentStore, desktopBinding } from "../../../../src/runtime/agents/store";
import { StateStore } from "../../../../src/runtime/state";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) await cleanup();
});
function fixture(options: ConstructorParameters<typeof AgentRuntime>[2] = {}) {
  const directory = mkdtempSync(join(tmpdir(), "raypx-history-clear-"));
  const state = new StateStore(profileStorage(directory));
  const f = {
    runtime: new AgentRuntime(state, () => {}, options),
    store: new AgentStore(profileStorage(directory).database),
    db: new Database(join(directory, "profile.sqlite")),
    state,
  };
  cleanups.push(async () => {
    f.db.close();
    await f.runtime.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  });
  return f;
}
function task(store: AgentStore, binding: string, prompt: string): AgentTask {
  return {
    id: crypto.randomUUID(),
    deviceId: store.deviceId(binding),
    projectId: crypto.randomUUID(),
    provider: "codex",
    mode: "run",
    prompt,
    summary: "Done",
    status: "succeeded",
    parentTaskId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
function create(value: AgentTask): RelayCommand {
  const { id, deviceId, projectId, provider, mode, prompt } = value;
  return {
    id,
    deviceId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    request: { method: "tasks.create", input: { id, deviceId, projectId, provider, mode, prompt } },
  };
}
function remember(store: AgentStore, binding: string, command: RelayCommand, value: unknown) {
  store.reserve(binding, command);
  store.complete(command.id, { ok: true, value });
}

it("removes local receipt content atomically while preserving active parents, other owners and replay fences", async () => {
  const f = fixture();
  const binding = desktopBinding("owner"),
    otherBinding = desktopBinding("other");
  const finished = task(f.store, binding, "clear-private-prompt");
  const parent = task(f.store, binding, "keep-parent");
  const active = {
    ...task(f.store, binding, "keep-active"),
    status: "waiting" as const,
    parentTaskId: parent.id,
  };
  const other = task(f.store, otherBinding, "keep-other");
  const followUp = { ...task(f.store, binding, "clear-follow-up"), parentTaskId: finished.id };
  for (const [value, owner] of [
    [finished, binding],
    [parent, binding],
    [active, binding],
    [other, otherBinding],
    [followUp, binding],
  ] as const)
    f.store.put({ task: value, binding: owner, sessionId: null });
  const context: TaskContextSnapshot = {
    capturedAt: finished.createdAt,
    sources: [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: "memory",
        name: "Reference",
        content: "clear-context-body",
        scope: "device",
        project: null,
      },
    ],
  };
  const approval: HumanRequest = {
    id: crypto.randomUUID(),
    taskId: finished.id,
    kind: "permission",
    title: "Approval",
    body: "clear-approval-body",
    questions: [],
    expiresAt: finished.createdAt,
    status: "applied",
    decision: { type: "deny", note: "clear-decision-note" },
  };
  f.store.request(binding, approval);
  const inputId = crypto.randomUUID();
  const commands: RelayCommand[] = [
    create(finished),
    {
      ...create(followUp),
      context,
      request: {
        method: "tasks.followUp",
        input: { id: followUp.id, parentTaskId: finished.id, prompt: followUp.prompt },
      },
    },
    {
      ...create(finished),
      id: inputId,
      request: {
        method: "tasks.input",
        input: {
          id: inputId,
          taskId: finished.id,
          mode: "queue",
          prompt: "clear-input-body",
        },
      },
    },
    {
      ...create(finished),
      id: crypto.randomUUID(),
      request: { method: "tasks.cancel", input: { id: finished.id } },
    },
    {
      ...create(finished),
      id: crypto.randomUUID(),
      request: {
        method: "approvals.decide",
        input: { id: approval.id, decision: approval.decision! },
      },
    },
  ];
  for (const command of commands)
    remember(f.store, binding, command, { ...finished, context, approval });
  for (const value of [parent, active]) remember(f.store, binding, create(value), value);
  const otherCommand = create(other);
  remember(f.store, otherBinding, otherCommand, other);
  expect(f.runtime.localClear("owner")).toEqual({ removed: 2 });
  expect(
    f.runtime
      .localTasks("owner", 100)
      .map((value) => value.id)
      .sort(),
  ).toEqual([parent.id, active.id].sort());
  expect(f.store.getRequest(binding, approval.id)).toBeUndefined();
  expect(f.store.taskEvents(binding, finished.id, 0)).toEqual([]);
  const rows = JSON.stringify(f.db.query("SELECT payload,result FROM commands").all());
  expect(rows).not.toContain("clear-");
  for (const marker of ["keep-parent", "keep-active", "keep-other"]) expect(rows).toContain(marker);
  for (const command of commands) {
    expect(f.store.reserve(binding, command)).toEqual({ ok: false, code: "NOT_FOUND" });
    f.store.complete(command.id, { ok: true, value: { prompt: "late-private-result" } });
    expect(f.store.reserve(binding, command)).toEqual({ ok: false, code: "NOT_FOUND" });
  }
  expect(() => f.store.reserve(otherBinding, commands[0]!)).toThrow("Command identity changed");
  expect(() =>
    f.store.reserve(binding, {
      ...commands[0]!,
      context: { ...context, sources: [{ ...context.sources[0]!, content: "Changed" }] },
    }),
  ).toThrow("Command identity changed");
  expect(f.store.reserve(otherBinding, otherCommand)).toEqual({ ok: true, value: other });
  expect(f.runtime.localClear("owner")).toEqual({ removed: 0 });
  await f.runtime.close();
  f.runtime = new AgentRuntime(f.state, () => {});
  expect(await f.runtime.localExecute("owner", finished.id, commands[0]!.request)).toEqual({
    ok: false,
    code: "NOT_FOUND",
  });
  expect(f.store.reserve(binding, commands[0]!)).toEqual({ ok: false, code: "NOT_FOUND" });
  expect(await f.runtime.remote(binding, commands[0]!)).toEqual({ ok: false, code: "NOT_FOUND" });
  expect(f.store.get(finished.id)).toBeUndefined();
});

it("rolls back receipt redaction together with a failed history deletion", () => {
  const f = fixture(),
    binding = desktopBinding("owner");
  const value = task(f.store, binding, "rollback-private-prompt"),
    command = create(value);
  f.store.put({ task: value, binding, sessionId: null });
  remember(f.store, binding, command, value);
  f.db.exec(
    "CREATE TRIGGER reject_clear BEFORE DELETE ON tasks BEGIN SELECT RAISE(ABORT,'synthetic clear failure'); END",
  );
  expect(() => f.runtime.localClear("owner")).toThrow(
    expect.objectContaining({
      cause: expect.objectContaining({ message: "synthetic clear failure" }),
    }),
  );
  expect(f.store.get(value.id)?.task).toEqual(value);
  expect(f.store.reserve(binding, command)).toEqual({ ok: true, value });
  f.db.exec("DROP TRIGGER reject_clear");
  expect(f.runtime.localClear("owner")).toEqual({ removed: 1 });
  expect(f.store.reserve(binding, command)).toEqual({ ok: false, code: "NOT_FOUND" });
});

it("clears old orphaned receipts while preserving a creation awaiting context resolution", async () => {
  const context: TaskContextSnapshot = {
    capturedAt: new Date().toISOString(),
    sources: [
      {
        id: crypto.randomUUID(),
        revision: 1,
        kind: "memory",
        name: "Reference",
        content: "Pending reference",
        scope: "device",
        project: null,
      },
    ],
  };
  const ready = Promise.withResolvers<TaskContextSnapshot>(),
    entered = Promise.withResolvers<void>();
  const f = fixture({
    resolveContext: async () => {
      entered.resolve();
      return ready.promise;
    },
  });
  vi.spyOn(f.runtime, "capabilities").mockResolvedValue([]);
  const binding = desktopBinding(LOCAL_WORKSPACE_ID);
  const orphan = task(f.store, binding, "old-cleared-prompt"),
    old = create(orphan);
  remember(f.store, binding, old, orphan);
  const oldDecision: RelayCommand = {
    ...old,
    id: crypto.randomUUID(),
    request: {
      method: "approvals.decide",
      input: { id: crypto.randomUUID(), decision: { type: "allow" } },
    },
  };
  remember(f.store, binding, oldDecision, { body: "old-cleared-approval" });
  const pending = create(task(f.store, binding, "pending-private-prompt"));
  if (pending.request.method !== "tasks.create") throw new Error("Expected creation");
  pending.request.input.contextSelection = {
    sources: context.sources.map(({ id, revision }) => ({ id, revision })),
  };
  const operation = f.runtime.localExecute(LOCAL_WORKSPACE_ID, pending.id, pending.request);
  await entered.promise;
  try {
    expect(f.runtime.localClear(LOCAL_WORKSPACE_ID)).toEqual({ removed: 0 });
    expect(f.store.reserve(binding, old)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(f.store.reserve(binding, oldDecision)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(f.store.reserve(binding, pending)).toBeNull();
    expect(JSON.stringify(f.db.query("SELECT payload,result FROM commands").all())).not.toContain(
      "old-cleared-",
    );
  } finally {
    ready.resolve(context);
  }
  expect(await operation).toMatchObject({
    ok: true,
    value: { prompt: "pending-private-prompt", context },
  });
  expect(f.runtime.localTask(LOCAL_WORKSPACE_ID, pending.id, 0).task.prompt).toBe(
    "pending-private-prompt",
  );
});
