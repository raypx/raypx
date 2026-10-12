import { expect, it } from "vite-plus/test";
import type {
  CloudConversationSnapshotDto,
  CloudRunEventDto,
  CloudRunSnapshotDto,
} from "@voidmix/contracts";
import { createCloudTimelineProjection, createConversationProjection } from "./cloud-projection";
const now = new Date("2026-10-08T00:00:00Z");
const event = (
  sequence: number,
  type: CloudRunEventDto["type"],
  payload: Record<string, unknown>,
): CloudRunEventDto => ({
  runId: "run",
  sequence,
  type,
  payload,
  occurredAt: now,
  executionId: null,
  eventId: String(sequence),
});
it("uses durable message text when old delta history is absent and retains unchanged rows", () => {
  const project = createConversationProjection();
  const conversation = {
    turns: [{ id: "turn", prompt: "问题", createdAt: now }],
    runs: [{ id: "run", turnId: "turn", retryOfRunId: null, attempt: 1, output: null }],
  } as CloudConversationSnapshotDto;
  const active = {
    run: { id: "run", output: null, status: "running" },
    messages: [{ messageId: "message", executionId: null, text: "完整回答" }],
    events: [],
    executions: [],
  } as unknown as CloudRunSnapshotDto;
  const initial = project(conversation, active);
  expect(initial[1]?.text).toBe("完整回答");
  expect(project(conversation, { ...active, cursor: 100 })).toBe(initial);
  const next = project(conversation, {
    ...active,
    messages: [{ ...active.messages[0]!, text: "完整回答继续" }],
  });
  expect(next[0]).toBe(initial[0]);
  expect(next[1]).not.toBe(initial[1]);
});
it("folds new tool events without rebuilding unrelated rows and incorporates an explicitly loaded older page", () => {
  const project = createCloudTimelineProjection();
  const a = event(10, "tool.started", { callId: "a", name: "first" });
  const b = event(11, "tool.started", { callId: "b", name: "second" });
  const snapshot = {
    run: { id: "run" },
    cursor: 11,
    events: [a, b],
    executions: [],
  } as unknown as CloudRunSnapshotDto;
  const initial = project(snapshot);
  expect(
    project({
      ...snapshot,
      cursor: 12,
      events: [a, b, event(12, "message.delta", { text: "token" })],
    }),
  ).toBe(initial);
  const next = project({
    ...snapshot,
    cursor: 13,
    events: [a, b, event(13, "tool.completed", { callId: "a", name: "first" })],
  });
  expect(next[0]).not.toBe(initial[0]);
  expect(next[1]).toBe(initial[1]);
  const history = project({
    ...snapshot,
    cursor: 13,
    events: [
      event(8, "run.status", { status: "running" }),
      a,
      b,
      event(13, "tool.completed", { callId: "a", name: "first" }),
    ],
  });
  expect(history[0]).toMatchObject({ kind: "status", status: "running" });
});
