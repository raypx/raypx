import { expect, it } from "vite-plus/test";
import { taskActivityPage, taskActivitySchema, type TaskActivity } from "../src/tasks.js";
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
