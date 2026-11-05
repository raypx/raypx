import { expect, it, vi } from "vite-plus/test";
import { ProviderEventIngestor, type IngestStore } from "./ingest.ts";
import { FakeIds } from "../domain/ports.ts";
import type { LocalAgentTask } from "../model.ts";
import type { TaskActivity } from "@raypx/core/tasks";

const at = "2026-01-01T00:00:00.000Z";
const local: LocalAgentTask = {
  binding: "relay:device",
  sessionId: null,
  task: {
    id: "00000000-0000-4000-8000-000000000040",
    deviceId: "00000000-0000-4000-8000-000000000041",
    projectId: "00000000-0000-4000-8000-000000000042",
    provider: "codex",
    mode: "run",
    prompt: "Task",
    status: "running",
    summary: "",
    parentTaskId: null,
    createdAt: at,
    updatedAt: at,
  },
};

it("commits provider reports through the store and notifies with the stored entry", () => {
  const stored: TaskActivity = {
    id: "00000000-0000-4000-8000-000000000043",
    taskId: local.task.id,
    kind: "message",
    text: "Done",
    status: "complete",
    truncated: false,
    createdAt: at,
    updatedAt: at,
    order: 4,
    revision: 2,
  };
  const recordTokenUsage = vi.fn<IngestStore["recordTokenUsage"]>();
  const put = vi.fn<IngestStore["put"]>(() => undefined);
  const store: IngestStore = { recordActivity: vi.fn(() => stored), recordTokenUsage, put };
  const notify = vi.fn();
  const ingest = new ProviderEventIngestor(store, { ...local }, new FakeIds(), notify);
  const { order: _order, revision: _revision, ...draft } = stored;
  // The caller sees the committed order and revision, not its own draft.
  expect(ingest.activity(draft)).toBe(stored);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "activity", entry: stored, taskId: local.task.id }),
  );
  const totals = {
    inputTokens: 1,
    outputTokens: 2,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
  ingest.usage(totals);
  expect(recordTokenUsage).toHaveBeenCalledWith(expect.anything(), totals);
  ingest.session("provider-session");
  expect(put).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "provider-session" }));
});
