import { expect, it } from "vite-plus/test";
import {
  applyActivityEvent,
  taskActivityPage,
  taskActivitySchema,
  type TaskActivity,
} from "../src/index.js";
const base = {
  id: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  order: 1,
  revision: 1,
  kind: "message" as const,
  text: "Hello",
  status: "complete" as const,
  truncated: false,
  createdAt: "2026-10-24T00:00:00Z",
  updatedAt: "2026-10-24T00:00:00Z",
};
it("requires a delta baseline and accepts the final full item as authoritative", () => {
  const streaming = { ...base, status: "streaming" as const };
  const delta = {
    id: "33333333-3333-4333-8333-333333333333",
    taskId: base.taskId,
    kind: "activity_delta" as const,
    entryId: base.id,
    baseRevision: 1,
    revision: 2,
    append: " world",
    updatedAt: base.updatedAt,
    truncated: false,
  };
  expect(applyActivityEvent(undefined, delta)).toBeUndefined();
  expect(applyActivityEvent({ ...streaming, revision: 0 }, delta)).toBeUndefined();
  const updated = applyActivityEvent(streaming, delta);
  expect(updated).toMatchObject({ text: "Hello world", revision: 2 });
  expect(applyActivityEvent(updated, delta)).toEqual(updated);
  const final = { ...base, revision: 3, text: "Authoritative final" };
  expect(
    applyActivityEvent(updated, {
      id: "44444444-4444-4444-8444-444444444444",
      taskId: base.taskId,
      kind: "activity",
      entry: final,
    }),
  ).toEqual(final);
  expect(applyActivityEvent(final, { ...delta, baseRevision: 3, revision: 4 })).toBeUndefined();
});
it("uses latest revisions and pages bounded Unicode messages without omitting an entry", () => {
  const entries: Extract<TaskActivity, { kind: "message" }>[] = Array.from(
    { length: 70 },
    (_, index) => ({ ...base, id: `id-${index}`, order: index + 1, text: "中😀".repeat(6000) }),
  );
  entries.push({ ...entries[10]!, revision: 2, text: "Updated" });
  const ids: string[] = [];
  let before: number | undefined;
  do {
    const page = taskActivityPage(entries, before);
    expect(page.activity.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(page.activity).length).toBeLessThan(192 * 1024);
    ids.unshift(...page.activity.map((entry) => entry.id));
    before = page.activityBefore;
  } while (before);
  expect(ids).toEqual(entries.slice(0, 70).map((entry) => entry.id));
  expect(
    taskActivityPage([base, { ...base, revision: 2, text: "Final" }]).activity[0],
  ).toMatchObject({ text: "Final" });
  expect(taskActivitySchema.safeParse({ ...base, kind: "usage", inputTokens: -1 }).success).toBe(
    false,
  );
});
