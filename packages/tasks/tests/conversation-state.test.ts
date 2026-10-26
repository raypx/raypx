import { expect, it } from "vite-plus/test";
import type { AgentEvent, TaskActivity } from "@raypx/core/tasks";
import { ConversationState } from "../src/model.js";

const message = (order: number, revision = 1): Extract<TaskActivity, { kind: "message" }> => ({
  id: `message-${order}`,
  taskId: "task",
  order,
  revision,
  kind: "message",
  text: `Message ${order}`,
  status: "streaming",
  truncated: false,
  createdAt: "2026-10-26T00:00:00.000Z",
  updatedAt: "2026-10-26T00:00:00.000Z",
});
const delta = (entry: TaskActivity, revision: number, append = " next"): AgentEvent => ({
  kind: "activity_delta",
  id: `delta-${entry.id}-${revision}`,
  taskId: entry.taskId,
  entryId: entry.id,
  baseRevision: revision - 1,
  revision,
  append,
  truncated: false,
  updatedAt: entry.updatedAt,
});

it("retains the newest revision and idempotent events across checkpoint refreshes", () => {
  const state = new ConversationState();
  const entry = message(2, 2);
  const event: AgentEvent = {
    id: "status",
    taskId: "task",
    kind: "status",
    status: "running",
    summary: "",
  };
  state.mergeLatest({ activity: [entry], events: [{ cursor: 5, event }], activityBefore: 2 });
  state.mergeLatest({ activity: [message(2), message(3)], events: [{ cursor: 5, event }] });
  expect(state.after).toBe(5);
  expect(state.snapshot().events).toEqual([{ cursor: 5, event }]);
  expect(state.snapshot().activity).toEqual([entry, message(3)]);
  expect(state.before).toBe(2);
  state.mergeOlder({ activity: [message(1)], events: [] });
  expect(state.snapshot().activity.map((item) => item.order)).toEqual([1, 2, 3]);
  expect(state.before).toBeUndefined();
});

it("applies duplicate deltas once and atomically rejects a batch missing its baseline", () => {
  const state = new ConversationState();
  const entry = message(1);
  state.mergeLatest({ activity: [entry], events: [] });
  expect(state.applyEvents([delta(entry, 2), delta(entry, 2)])?.[0]).toMatchObject({
    text: "Message 1 next",
    revision: 2,
  });
  expect(state.applyEvents([delta(entry, 3), delta(entry, 5)])).toBeUndefined();
  expect(state.snapshot().activity[0]).toMatchObject({ text: "Message 1 next", revision: 2 });
  state.mergeLatest({
    activity: [{ ...entry, revision: 5, text: "Authoritative result", status: "complete" }],
    events: [],
  });
  expect(state.snapshot().activity[0]).toMatchObject({
    revision: 5,
    text: "Authoritative result",
    status: "complete",
  });
});

it("tracks hidden-period gaps separately from older history and fills them in pages", () => {
  const state = new ConversationState();
  state.mergeLatest({ activity: [message(2)], activityBefore: 2, events: [] });
  state.mergeLatest({ activity: [message(65)], activityBefore: 65, events: [] });
  expect(state.snapshot().activityGaps).toEqual([{ id: 65, before: 65, after: 2 }]);
  state.mergeGap(65, { activity: [message(34)], activityBefore: 34, events: [] });
  expect(state.gap(65)).toEqual({ id: 65, before: 34, after: 2 });
  expect(state.before).toBe(2);
  state.mergeGap(65, { activity: [message(3)], activityBefore: 2, events: [] });
  expect(state.snapshot().activityGaps).toEqual([]);
  expect(state.snapshot().activity.map((item) => item.order)).toEqual([2, 3, 34, 65]);
  state.mergeOlder({ activity: [message(1)], events: [] });
  expect(state.before).toBeUndefined();
});

it("keeps a history gap when a live entry arrives before the recovering checkpoint", () => {
  const state = new ConversationState();
  state.mergeLatest({ activity: [message(1)], events: [] });
  state.applyEvents([{ kind: "activity", id: "live", taskId: "task", entry: message(100) }]);
  state.mergeLatest({
    activity: Array.from({ length: 64 }, (_, index) => message(index + 37)),
    activityBefore: 37,
    events: [],
  });
  expect(state.snapshot().activityGaps).toEqual([{ id: 37, before: 37, after: 1 }]);
  state.mergeGap(37, { activity: [message(2)], events: [] });
  expect(state.snapshot().activityGaps).toEqual([]);
});

it("tracks sparse checkpoint coverage without treating global row ID jumps as missing entries", () => {
  const state = new ConversationState();
  state.mergeLatest({ activity: [message(7), message(41), message(103)], events: [] });
  expect(state.snapshot().activityGaps).toEqual([]);
  state.applyEvents([{ kind: "activity", id: "live", taskId: "task", entry: message(9000) }]);
  state.mergeLatest({ activity: [message(600), message(2000)], activityBefore: 600, events: [] });
  expect(state.snapshot().activityGaps).toEqual([{ id: 600, before: 600, after: 103 }]);
  // An older in-flight snapshot must not lower the latest authoritative boundary.
  state.mergeLatest({ activity: [message(800)], activityBefore: 800, events: [] });
  state.mergeLatest({ activity: [message(4000)], activityBefore: 4000, events: [] });
  expect(state.snapshot().activityGaps).toEqual([
    { id: 600, before: 600, after: 103 },
    { id: 4000, before: 4000, after: 2000 },
  ]);
  expect(state.snapshot().activity.at(-1)?.order).toBe(9000);
});

it("does not mark fully observed sparse live entries as a gap on a bounded refresh", () => {
  const state = new ConversationState();
  state.beginRecovery();
  state.mergeLatest({ activity: [message(7)], events: [] });
  const entries = Array.from({ length: 70 }, (_, index) => message(1000 + index * 10));
  state.applyEvents(
    entries.map((entry) => ({ kind: "activity", id: entry.id, taskId: "task", entry })),
  );
  state.mergeLatest({
    activity: entries.slice(-64),
    activityBefore: entries[6]!.order,
    events: [],
  });
  expect(state.snapshot().activityGaps).toEqual([]);
});

it("keeps a loadable trailing gap when an old checkpoint has not caught resumed live entries", () => {
  const state = new ConversationState();
  state.beginRecovery();
  state.mergeLatest({ activity: [message(50)], events: [] });
  state.beginRecovery();
  state.applyEvents([{ kind: "activity", id: "resumed", taskId: "task", entry: message(100) }]);
  state.mergeLatest({ activity: [message(37), message(80)], activityBefore: 37, events: [] });
  expect(state.snapshot().activityGaps).toEqual([{ id: 100, before: 100, after: 80 }]);
  state.applyEvents([{ kind: "activity", id: "ahead", taskId: "task", entry: message(110) }]);
  state.mergeLatest({ activity: [message(90)], activityBefore: 90, events: [] });
  expect(state.snapshot().activityGaps).toEqual([{ id: 110, before: 110, after: 80 }]);
  state.mergeLatest({
    activity: [message(37), message(80), message(90), message(100), message(110)],
    activityBefore: 37,
    events: [],
  });
  expect(state.snapshot().activityGaps).toEqual([]);
  state.applyEvents([
    { kind: "activity", id: "continuous-again", taskId: "task", entry: message(120) },
  ]);
  state.mergeLatest({ activity: [message(120)], activityBefore: 120, events: [] });
  expect(state.snapshot().activityGaps).toEqual([]);
});

it("returns detached gap metadata and ignores pages for an already filled gap", () => {
  const state = new ConversationState();
  state.mergeLatest({ activity: [message(1)], events: [] });
  state.mergeLatest({ activity: [message(65)], activityBefore: 65, events: [] });
  const gap = state.gap(65)!;
  gap.before = 999;
  state.snapshot().activityGaps[0]!.before = 1000;
  expect(state.gap(65)?.before).toBe(65);
  state.mergeGap(65, { activity: [message(2)], events: [] });
  state.mergeGap(65, { activity: [message(999)], events: [] });
  expect(state.snapshot().activity.map((item) => item.order)).toEqual([1, 2, 65]);
});
