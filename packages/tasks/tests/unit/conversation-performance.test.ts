import { expect, it } from "vite-plus/test";

import type { AgentEvent, TaskActivity } from "@raypx/core/tasks";
import { ConversationState } from "../../src/model.js";

it("keeps 10,000 loaded entries and bounds historical work during tail streaming", () => {
  let orderReads = 0;
  const entries: TaskActivity[] = Array.from({ length: 10_000 }, (_, index) => ({
    id: `message-${index}`,
    taskId: "task",
    get order() {
      orderReads++;
      return index + 1;
    },
    revision: 1,
    kind: "message",
    text: `Message ${index}`,
    status: "streaming",
    truncated: false,
    createdAt: "2026-10-31T00:00:00.000Z",
    updatedAt: "2026-10-31T00:00:00.000Z",
  }));
  const state = new ConversationState();
  const initial = state.mergeLatest({ activity: entries, events: [] });
  expect(state.snapshot()).toBe(initial);
  orderReads = 0;
  const started = performance.now();
  for (let revision = 2; revision <= 101; revision++) {
    state.applyEvents([
      {
        id: `delta-${revision}`,
        taskId: "task",
        kind: "activity_delta",
        entryId: "message-9999",
        baseRevision: revision - 1,
        revision,
        append: " next",
        truncated: false,
        updatedAt: "2026-10-31T00:00:00.000Z",
      },
    ]);
  }
  const next = state.snapshot();
  console.info(
    JSON.stringify({
      benchmark: "conversation-tail-deltas",
      loadedRows: entries.length,
      deltas: 100,
      elapsedMs: performance.now() - started,
    }),
  );
  expect(next.activity).toHaveLength(10_000);
  expect(
    next.activity.slice(0, -1).every((entry, index) => entry === initial.activity[index]),
  ).toBe(true);
  expect(next.activity.at(-1)).toMatchObject({ revision: 101 });
  // Revisions must not re-read and re-sort every historical order.
  expect(orderReads).toBeLessThan(500);
  expect(state.snapshot()).toBe(next);
  state.mergeLatest({ activity: entries, events: [] });
  expect(state.snapshot()).toBe(next);
});

it("rejects a mixed batch atomically without changing any cached snapshot", () => {
  const state = new ConversationState();
  const entry: TaskActivity = {
    id: "entry",
    taskId: "task",
    order: 10,
    revision: 1,
    kind: "message",
    text: "Baseline",
    status: "streaming",
    truncated: false,
    createdAt: "now",
    updatedAt: "now",
  };
  const before = state.mergeLatest({ activity: [entry], events: [] });
  const delta: AgentEvent = {
    id: "delta",
    taskId: "task",
    kind: "activity_delta",
    entryId: entry.id,
    baseRevision: 1,
    revision: 2,
    append: " next",
    truncated: false,
    updatedAt: "later",
  };
  expect(
    state.applyEvents([delta, { ...delta, id: "missing", entryId: "missing" }]),
  ).toBeUndefined();
  expect(state.snapshot()).toBe(before);
  expect(state.applyEvents([delta, delta])?.[0]).toMatchObject({
    text: "Baseline next",
    revision: 2,
  });
});

it("inserts sparse older history in order and retains unchanged revision objects", () => {
  const state = new ConversationState();
  const make = (order: number): TaskActivity => ({
    id: `entry-${order}`,
    taskId: "task",
    order,
    revision: 1,
    kind: "message",
    text: `${order}`,
    status: "complete",
    truncated: false,
    createdAt: "now",
    updatedAt: "now",
  });
  const latest = make(900),
    middle = make(300);
  state.mergeLatest({ activity: [latest], activityBefore: 900, events: [] });
  state.mergeOlder({ activity: [middle, make(10), make(100)], events: [] });
  const before = state.snapshot();
  expect(before.activity.map((entry) => entry.order)).toEqual([10, 100, 300, 900]);
  state.applyEvents([
    { id: "revision", taskId: "task", kind: "activity", entry: { ...middle, revision: 2 } },
  ]);
  expect(state.snapshot().activity.at(-1)).toBe(latest);
  expect(state.snapshot().activity[0]).toBe(before.activity[0]);
  expect(state.snapshot().activity.map((entry) => entry.order)).toEqual([10, 100, 300, 900]);
});
