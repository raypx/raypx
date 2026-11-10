import { describe, expect, it } from "vite-plus/test";
import type { AgentTask } from "@raypx/core/tasks";
import { sessionThreads } from "./session-threads.ts";

let next = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
const deviceId = uuid();
const projectId = uuid();

function task(prompt: string, minute: number, parentTaskId: string | null = null): AgentTask {
  const at = new Date(Date.UTC(2026, 10, 10, 8, minute)).toISOString();
  return {
    id: uuid(),
    deviceId,
    projectId,
    provider: "codex",
    mode: "run",
    prompt,
    status: "succeeded",
    summary: "",
    parentTaskId,
    createdAt: at,
    updatedAt: at,
  } satisfies AgentTask;
}

describe("session threads", () => {
  it("joins follow-ups to the conversation they continue and orders by latest activity", () => {
    const first = task("Fix the build", 1);
    const other = task("Write release notes", 2);
    const followUp = task("Also update the tests", 3, first.id);
    const second = task("And the docs", 4, followUp.id);
    const threads = sessionThreads([second, followUp, other, first]);
    expect(threads.map((thread) => thread.root.prompt)).toEqual([
      "Fix the build",
      "Write release notes",
    ]);
    expect(threads[0]!.latest.id).toBe(second.id);
    expect([...threads[0]!.taskIds]).toHaveLength(3);
  });

  it("starts a thread at a follow-up whose parent is outside the page", () => {
    const orphan = task("Continue the migration", 5, uuid());
    expect(sessionThreads([orphan])).toEqual([
      { root: orphan, latest: orphan, taskIds: new Set([orphan.id]) },
    ]);
  });
});
