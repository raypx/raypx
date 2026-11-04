import { profileStorage, removeProfileDirectory } from "./sqlite";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HumanRequest, TaskActivity } from "@raypx/core/tasks";
import { AgentStore } from "../../src/runtime/agents/store";
import type { LocalAgentTask } from "../../src/runtime/agents/model";

export const uuid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
export const now = "2026-10-31T00:00:00.000Z";
// Inspect plans independently of Drizzle's quoting, case and whitespace choices.
export const normalizedSql = (statement: string) =>
  statement.replaceAll('"', "").toLowerCase().replace(/\s+/g, " ");
export function task(
  index: number,
  binding = "relay",
  status: LocalAgentTask["task"]["status"] = "succeeded",
): LocalAgentTask {
  return {
    binding,
    sessionId: null,
    task: {
      id: uuid(index),
      deviceId: uuid(1),
      projectId: uuid(2),
      provider: "codex",
      mode: "run",
      prompt: "Short task",
      summary: "Done",
      status,
      parentTaskId: null,
      createdAt: now,
      updatedAt: now,
    },
  };
}
export function activity(
  index: number,
  taskId: string,
  text = "done",
  status: "complete" | "streaming" = "complete",
): TaskActivity {
  return {
    id: uuid(1_000_000 + index),
    taskId,
    kind: "message",
    text,
    status,
    truncated: false,
    createdAt: now,
    updatedAt: now,
    order: index + 1,
    revision: 1,
  };
}
export function request(index: number, taskId: string, body = "Confirm"): HumanRequest {
  return {
    id: uuid(2_000_000 + index),
    taskId,
    kind: "permission",
    title: "Permission",
    body,
    questions: [],
    expiresAt: now,
    status: "pending",
    decision: null,
  };
}
export function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-snapshot-performance-"));
  const store = new AgentStore(profileStorage(directory).database);
  const database = new Database(join(directory, "profile.sqlite"));
  return {
    directory,
    store,
    database,
    put: database.query("INSERT OR REPLACE INTO tasks VALUES (?,?)"),
    activity: database.query("INSERT INTO activity VALUES (?,?,?,?)"),
    request: database.query("INSERT INTO requests VALUES (?,?,?)"),
    close() {
      database.close();
      removeProfileDirectory(directory, { recursive: true, force: true });
    },
  };
}
