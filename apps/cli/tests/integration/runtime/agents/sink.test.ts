import { expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profileStorage, removeProfileDirectory } from "../../../helpers/sqlite.js";
import { AgentStore } from "../../../../src/runtime/agents/store.js";
import type { LocalAgentTask } from "../../../../src/runtime/agents/model.js";

/**
 * The sink is the one commit boundary: a receipt, an event projection and the
 * relay journal row land together, and a failing write rolls all of them back.
 */

const task: LocalAgentTask = {
  binding: "relay:device",
  sessionId: null,
  task: {
    id: "00000000-0000-4000-8000-000000000010",
    deviceId: "00000000-0000-4000-8000-000000000011",
    projectId: "00000000-0000-4000-8000-000000000012",
    provider: "codex",
    mode: "run",
    prompt: "Task",
    status: "pending",
    summary: "",
    parentTaskId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
};

it("commits the receipt, the task projection and the outbox event together", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-sink-"));
  try {
    const store = new AgentStore(profileStorage(directory).database);
    store.accept(task, "00000000-0000-4000-8000-000000000013");
    expect(store.seen("00000000-0000-4000-8000-000000000013")).toBe(true);
    expect(store.get(task.task.id)?.task.status).toBe("pending");
    // Acceptance itself is not a relay event; nothing is owed to the relay yet.
    expect(store.events(task.binding)).toEqual([]);
    const status = {
      id: "00000000-0000-4000-8000-000000000014",
      taskId: task.task.id,
      kind: "status" as const,
      status: "running" as const,
      summary: "",
      task: { ...task.task, status: "running" as const },
    };
    store.transition({ ...task, task: status.task }, status);
    expect(store.events(task.binding).map((event) => event.kind)).toEqual(["status"]);
    expect(store.sequence(task.binding)).toBe(1);
  } finally {
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});

it("rolls a transition back when its journal write fails", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-sink-rollback-"));
  try {
    const store = new AgentStore(profileStorage(directory).database);
    store.accept(task, "00000000-0000-4000-8000-000000000016");
    const status = {
      id: "00000000-0000-4000-8000-000000000017",
      taskId: task.task.id,
      kind: "status" as const,
      status: "succeeded" as const,
      summary: "Done",
      task: { ...task.task, status: "succeeded" as const, summary: "Done" },
    };
    const journal = vi.spyOn(store, "event").mockImplementationOnce(() => {
      throw new Error("Synthetic write failure");
    });
    expect(() => store.transition({ ...task, task: status.task }, status)).toThrow(
      "Synthetic write failure",
    );
    journal.mockRestore();
    // The task row, the journal and the outbox all rolled back together.
    expect(store.get(task.task.id)?.task.status).toBe("pending");
    expect(store.events(task.binding)).toEqual([]);
    store.transition({ ...task, task: status.task }, status);
    expect(store.get(task.task.id)?.task.status).toBe("succeeded");
    expect(store.events(task.binding).map((event) => event.kind)).toEqual(["status"]);
  } finally {
    removeProfileDirectory(directory, { recursive: true, force: true });
  }
});
