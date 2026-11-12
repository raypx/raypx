import { expect, it } from "vitest";
import { apply } from "./projector.js";
import { toWireEvents } from "./wire.js";
import { FakeIds } from "./ports.js";
import type {
  ActivityRecorded,
  OrchestrationEvent,
  RequestOpened,
  TaskAccepted,
  TaskStatusChanged,
} from "./events.js";

const id = "00000000-0000-4000-8000-000000000001";
const taskId = "00000000-0000-4000-8000-000000000002";
const at = "2026-01-01T00:00:00.000Z";
const task = {
  id: taskId,
  deviceId: "00000000-0000-4000-8000-000000000003",
  projectId: "00000000-0000-4000-8000-000000000004",
  provider: "codex" as const,
  mode: "run" as const,
  prompt: "Task",
  status: "running" as const,
  summary: "",
  parentTaskId: null,
  createdAt: at,
  updatedAt: at,
};
const request = {
  id: "00000000-0000-4000-8000-000000000005",
  taskId,
  kind: "permission" as const,
  title: "Codex",
  body: "{}",
  questions: [],
  expiresAt: "2026-01-01T00:10:00.000Z",
  status: "pending" as const,
  decision: null,
};
const entry = {
  id: "00000000-0000-4000-8000-000000000006",
  taskId,
  kind: "message" as const,
  text: "Done",
  status: "complete" as const,
  truncated: false,
  createdAt: at,
  updatedAt: at,
  order: 1,
  revision: 1,
};

it("projects task, request and activity events to one row each", () => {
  const accepted: TaskAccepted = {
    type: "task.accepted",
    id,
    binding: "relay:device",
    taskId,
    at,
    task,
    sessionId: null,
    receiptId: id,
  };
  expect(apply(accepted)).toEqual({
    task: { taskId, binding: "relay:device", task, sessionId: null },
    request: undefined,
    activity: undefined,
    usage: undefined,
  });
  const status: TaskStatusChanged = {
    type: "task.statusChanged",
    id,
    binding: "relay:device",
    taskId,
    at,
    task: { ...task, status: "succeeded", summary: "Done" },
    sessionId: "session",
    settledRequests: [],
    settledActivity: [],
  };
  expect(apply(status).task).toMatchObject({ sessionId: "session" });
  const opened: RequestOpened = {
    type: "request.opened",
    id,
    binding: "relay:device",
    taskId,
    at,
    request,
  };
  expect(apply(opened)).toEqual({
    task: undefined,
    request: { request },
    activity: undefined,
    usage: undefined,
  });
  const recorded: ActivityRecorded = {
    type: "activity.recorded",
    id,
    binding: "relay:device",
    taskId,
    at,
    entry,
  };
  expect(apply(recorded)).toEqual({
    task: undefined,
    request: undefined,
    activity: { entry },
    usage: undefined,
  });
});

it("maps a domain event to today's wire records and keeps Desktop activity local", () => {
  const accepted: OrchestrationEvent = {
    type: "task.accepted",
    id,
    binding: "relay:device",
    taskId,
    at,
    task,
    sessionId: null,
    receiptId: id,
  };
  // Acceptance has no relay event of its own; the first status follows it.
  expect(toWireEvents(accepted)).toEqual([]);
  const status: OrchestrationEvent = {
    type: "task.statusChanged",
    id,
    binding: "relay:device",
    taskId,
    at,
    task: { ...task, status: "succeeded" },
    sessionId: null,
    settledRequests: [],
    settledActivity: [],
  };
  expect(toWireEvents(status)).toEqual([
    expect.objectContaining({ id, taskId, kind: "status", status: "succeeded" }),
  ]);
  const opened: OrchestrationEvent = {
    type: "request.opened",
    id,
    binding: "relay:device",
    taskId,
    at,
    request,
  };
  expect(toWireEvents(opened)).toEqual([{ id, taskId, kind: "request", request }]);
  const delta: OrchestrationEvent = {
    type: "activity.recorded",
    id,
    binding: "relay:device",
    taskId,
    at,
    entry,
    delta: {
      entryId: entry.id,
      baseRevision: 1,
      revision: 2,
      append: " more",
      truncated: false,
    },
  };
  expect(toWireEvents(delta)).toEqual([
    expect.objectContaining({ kind: "activity_delta", append: " more", baseRevision: 1 }),
  ]);
  expect(toWireEvents({ ...delta, binding: "desktop:account" })).toEqual([]);
  expect(new FakeIds().generate()).toMatch(/^00000000-0000-4000-8000-\d{12}$/);
});
