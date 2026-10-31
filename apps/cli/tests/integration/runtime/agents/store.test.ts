import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AgentStore,
  desktopBinding,
  type LocalAgentTask,
} from "../../../../src/runtime/agents/store";
import { AgentRuntime } from "../../../../src/runtime/agents";
import { StateStore } from "../../../../src/runtime/state";

import { taskSchema, type AgentEvent } from "@raypx/core/tasks";
import { Database } from "bun:sqlite";

afterEach(() => vi.restoreAllMocks());
it("stores local text once and sends linear-size relay deltas with a bounded referenced outbox", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-stream-storage-"));
  const store = new AgentStore(profileStorage(directory).database);
  const now = new Date().toISOString(),
    taskId = crypto.randomUUID();
  const message = {
    taskId,
    id: crypto.randomUUID(),
    kind: "message" as const,
    text: "",
    status: "streaming" as const,
    truncated: false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    for (const binding of [desktopBinding("account"), "relay"]) {
      const draft = { ...message, id: crypto.randomUUID() };
      for (let index = 0; index <= 1000; index++)
        store.recordActivity(binding, { ...draft, text: "x".repeat(index * 32) });
      store.recordActivity(binding, { ...draft, text: "x".repeat(32_000), status: "complete" });
      expect(store.activity(binding, taskId)).toHaveLength(1);
    }
    const db = new Database(join(directory, "profile.sqlite"));
    try {
      expect(
        db.query("SELECT count(*) AS count FROM journal WHERE binding LIKE 'desktop:%'").get(),
      ).toEqual({ count: 0 });
      const rows = db.query("SELECT value FROM journal WHERE binding='relay'").all() as {
        value: string;
      }[];
      expect(rows.filter((row) => JSON.parse(row.value).kind === "activity_delta")).toHaveLength(
        1000,
      );
      expect(rows.reduce((bytes, row) => bytes + Buffer.byteLength(row.value), 0)).toBeLessThan(
        32_000 * 2 + rows.length * 600,
      );
      expect(db.query("SELECT count(*) AS count FROM outbox WHERE value!=''").get()).toEqual({
        count: 0,
      });
    } finally {
      db.close();
    }
  } finally {
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
it("compacts journal bytes and removes dangling outbox references without removing final activity", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-byte-window-")),
    store = new AgentStore(profileStorage(directory).database, 4096, 2048);
  try {
    for (let index = 0; index < 20; index++)
      store.event("relay", {
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        kind: "status",
        status: "succeeded",
        summary: "x".repeat(600),
      });
    const db = new Database(join(directory, "profile.sqlite"));
    try {
      expect(
        (
          db.query("SELECT sum(length(CAST(value AS BLOB))) AS bytes FROM journal").get() as {
            bytes: number;
          }
        ).bytes,
      ).toBeLessThanOrEqual(2048);
      expect(
        db
          .query("SELECT count(*) AS count FROM outbox WHERE id NOT IN (SELECT id FROM journal)")
          .get(),
      ).toEqual({ count: 0 });
    } finally {
      db.close();
    }
    const cursor = store.sequence("relay");
    store.checkpoint("relay", cursor);
    store.checkpoint("relay", cursor);
    expect(store.events("relay")).toEqual([]);
    expect(store.replay("relay", 0).floor).toBeGreaterThan(1);
  } finally {
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
it("leaves existing local journal rows intact and bounds remote replay on restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-old-journal-"));
  const initialStorage = profileStorage(directory);
  const streamId = new AgentStore(initialStorage.database).streamId;
  initialStorage.close();
  const db = new Database(join(directory, "profile.sqlite"));
  const local = desktopBinding("account");
  const status = {
    id: crypto.randomUUID(),
    taskId: crypto.randomUUID(),
    kind: "status",
    status: "succeeded",
    summary: "kept",
  };
  db.query("INSERT INTO journal (id,binding,value) VALUES (?,?,?)").run(
    status.id,
    local,
    JSON.stringify(status),
  );
  for (let index = 0; index < 1100; index++) {
    const event = { ...status, id: crypto.randomUUID(), kind: "activity" };
    db.query("INSERT INTO journal (id,binding,value) VALUES (?,?,?)").run(
      event.id,
      local,
      JSON.stringify(event),
    );
  }
  for (let index = 0; index < 10; index++) {
    const event = { ...status, id: crypto.randomUUID() };
    db.query("INSERT INTO journal (id,binding,value) VALUES (?,?,?)").run(
      event.id,
      "relay",
      JSON.stringify(event),
    );
    db.query("INSERT INTO outbox (id,binding,value) VALUES (?,?,?)").run(
      event.id,
      "relay",
      JSON.stringify(event),
    );
  }
  const restored = new AgentStore(profileStorage(directory).database, 3);
  try {
    expect(restored.streamId).toBe(streamId);
    expect(restored.taskEvents(local, status.taskId, 0).map((item) => item.event)).toEqual([
      status,
    ]);
    expect(db.query("SELECT count(*) AS count FROM journal WHERE binding=?").get(local)).toEqual({
      count: 1101,
    });
    expect(restored.events("relay")).toHaveLength(3);
    expect(db.query("SELECT count(*) AS count FROM outbox").get()).toEqual({
      count: 3,
    });
  } finally {
    db.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});

it("rolls back the task transition when its outbox write fails and preserves a committed result across restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-agent-transition-"));
  const state = new StateStore(profileStorage(directory));
  let store: AgentStore | undefined = new AgentStore(profileStorage(directory).database);
  let runtime: AgentRuntime | undefined;
  try {
    const local: LocalAgentTask = {
      binding: "binding",
      sessionId: "session",
      task: {
        id: crypto.randomUUID(),
        deviceId: crypto.randomUUID(),
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: "Task",
        status: "running",
        summary: "",
        parentTaskId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    store.put(local);
    const completed: LocalAgentTask = {
      ...local,
      task: { ...local.task, status: "succeeded", summary: "Durable result" },
    };
    const event: AgentEvent = {
      id: crypto.randomUUID(),
      taskId: local.task.id,
      kind: "status",
      status: "succeeded",
      summary: "Durable result",
    };
    const insert = vi.spyOn(store, "event").mockImplementationOnce(() => {
      throw new Error("Interrupted write");
    });
    expect(() => store!.transition(completed, event)).toThrow("Interrupted write");
    expect(store.get(local.task.id)?.task.status).toBe("running");
    expect(store.events(local.binding)).toEqual([]);
    insert.mockRestore();
    store.transition(completed, event);
    store = new AgentStore(profileStorage(directory).database);
    expect(store.get(local.task.id)?.task).toMatchObject({
      status: "succeeded",
      summary: "Durable result",
    });
    expect(store.events(local.binding)).toEqual([event]);
    store = undefined;
    runtime = new AgentRuntime(state, () => {});
    expect(runtime.events(local.binding).events).toEqual([event]);
    runtime.ack(local.binding, [event.id]);
    expect(runtime.events(local.binding).events).toEqual([]);
  } finally {
    await runtime?.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
it("keeps Desktop identity and task history across restart without creating a relay outbox", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-agent-")),
    state = new StateStore(profileStorage(directory)),
    binding = desktopBinding("account-a");
  const store = new AgentStore(profileStorage(directory).database),
    deviceId = store.deviceId(binding);
  const task: LocalAgentTask = {
    binding,
    sessionId: null,
    task: {
      id: crypto.randomUUID(),
      deviceId,
      projectId: crypto.randomUUID(),
      provider: "codex",
      mode: "run",
      prompt: "Private local task",
      status: "running",
      summary: "",
      parentTaskId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
  store.put(task);
  const now = new Date().toISOString(),
    queuedId = crypto.randomUUID(),
    sendingId = crypto.randomUUID(),
    messageId = crypto.randomUUID();
  for (const [id, status] of [
    [queuedId, "queued"],
    [sendingId, "sending"],
  ] as const)
    store.recordActivity(binding, {
      id,
      taskId: task.task.id,
      kind: "input",
      mode: "queue",
      text: "Never infer again automatically",
      status,
      createdAt: now,
      updatedAt: now,
    });
  store.recordActivity(binding, {
    id: messageId,
    taskId: task.task.id,
    kind: "message",
    text: "Partial reply",
    truncated: false,
    status: "streaming",
    createdAt: now,
    updatedAt: now,
  });
  const runtime = new AgentRuntime(state, () => {});
  try {
    expect(runtime.localTasks("account-a", 100)[0]).toMatchObject({
      id: task.task.id,
      deviceId,
      status: "interrupted",
    });
    expect(runtime.localTasks("account-b", 100)).toEqual([]);
    const activity = runtime.localTask("account-a", task.task.id, 0).activity;
    expect(activity.find((entry) => entry.id === queuedId)).toMatchObject({
      status: "cancelled",
      code: "HOST_RESTARTED",
    });
    expect(activity.find((entry) => entry.id === sendingId)).toMatchObject({
      status: "interrupted",
      code: "HOST_RESTARTED",
    });
    expect(activity.find((entry) => entry.id === messageId)).toMatchObject({
      status: "interrupted",
      text: "Partial reply",
      revision: 2,
    });
    expect(runtime.events(binding).events).toEqual([]);
    expect(runtime.replay("remote-binding", 0).events).toEqual([]);
    const reopened = new AgentStore(profileStorage(directory).database);
    {
      expect(reopened.deviceId(binding)).toBe(deviceId);
      expect(reopened.deviceId(desktopBinding("account-b"))).not.toBe(deviceId);
      expect(reopened.taskEvents(binding, task.task.id, 0).at(-1)?.event).toMatchObject({
        kind: "status",
        status: "interrupted",
      });
    }
  } finally {
    await runtime.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
it("paginates every local task across byte and record limits, including equal timestamps", async () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-pages-")),
    state = new StateStore(profileStorage(directory)),
    runtime = new AgentRuntime(state, () => {}),
    store = new AgentStore(profileStorage(directory).database),
    binding = desktopBinding("account-a"),
    deviceId = store.deviceId(binding);
  try {
    const tasks = Array.from({ length: 106 }, (_, index) =>
      taskSchema.parse({
        id: crypto.randomUUID(),
        deviceId,
        projectId: crypto.randomUUID(),
        provider: "codex",
        mode: "run",
        prompt: index < 3 ? "中".repeat(32_000) : `Task ${index}`,
        summary: index < 3 ? "文".repeat(32_000) : "Done",
        status: "succeeded",
        parentTaskId: null,
        createdAt: new Date(1_700_000_000_000 - (index === 105 ? 86_400_000 : 0)).toISOString(),
        updatedAt: new Date(1_700_000_000_000).toISOString(),
      }),
    );
    for (const task of tasks) store.put({ task, binding, sessionId: null });
    expect(runtime.localTasks("account-a", 100, "")).toEqual(runtime.localTasks("account-a", 100));
    const ids: string[] = [];
    let before: string | undefined;
    for (let pageNumber = 0; pageNumber <= tasks.length; pageNumber++) {
      const page = runtime.localTasks("account-a", 100, before);
      if (!page.length) break;
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(257 * 1024);
      ids.push(...page.map((task) => task.id));
      const last = page.at(-1)!;
      before = `${last.createdAt}:${last.id}`;
    }
    expect(ids).toEqual(
      tasks
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
        .map((task) => task.id),
    );
    expect(runtime.localTasks("account-b", 100)).toEqual([]);
  } finally {
    await runtime.close();
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
it("retains local activity across relay compaction and restart without creating a cloud outbox", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-local-history-")),
    binding = desktopBinding("account-a"),
    oldTaskId = crypto.randomUUID(),
    nextTaskId = crypto.randomUUID();
  let store = new AgentStore(profileStorage(directory).database, 8);
  const event = (taskId: string): AgentEvent => ({
    id: crypto.randomUUID(),
    taskId,
    kind: "status",
    status: "succeeded",
    summary: "Saved activity",
  });
  try {
    const original = event(oldTaskId);
    store.event(binding, original);
    store.event("remote-binding", event(oldTaskId));
    const remoteStart = store.sequence("remote-binding");
    for (let index = 0; index < 8; index++) {
      store.event(binding, event(nextTaskId));
      store.event("remote-binding", event(nextTaskId));
    }
    store.checkpoint("remote-binding", store.sequence("remote-binding"));
    store = new AgentStore(profileStorage(directory).database, 8);
    expect(store.taskEvents(binding, oldTaskId, 0).map((item) => item.event)).toEqual([original]);
    expect(store.taskEvents(desktopBinding("account-b"), oldTaskId, 0)).toEqual([]);
    expect(store.events(binding)).toEqual([]);
    expect(store.events("remote-binding")).toEqual([]);
    expect(store.taskEvents("remote-binding", oldTaskId, 0)).toEqual([]);
    expect(store.replay("remote-binding", 0).floor).toBeGreaterThan(remoteStart);
  } finally {
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
