import { expect, it } from "vite-plus/test";
import {
  taskContextSelectionSchema,
  taskContextSnapshotSchema,
  taskExecutionPrompt,
} from "../src/tasks.js";

const source = {
  id: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  kind: "memory" as const,
  name: "Project conventions",
  content: "Use the existing style.",
  scope: "device" as const,
  project: null,
};
const context = { capturedAt: new Date().toISOString(), sources: [source] };
it("requires unique selected revisions and bounds frozen sources", () => {
  expect(
    taskContextSelectionSchema.safeParse({ sources: [{ id: source.id, revision: 0 }] }).success,
  ).toBe(false);
  const reference = { id: source.id, revision: source.revision };
  expect(taskContextSelectionSchema.safeParse({ sources: [reference, reference] }).success).toBe(
    false,
  );
  expect(
    taskContextSnapshotSchema.safeParse({
      ...context,
      sources: [{ ...source, content: "x".repeat(8001) }],
    }).success,
  ).toBe(false);
  expect(
    taskContextSnapshotSchema.safeParse({
      ...context,
      sources: Array.from({ length: 9 }, (_, index) => ({
        ...source,
        id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      })),
    }).success,
  ).toBe(false);
});
it("preserves original task text and marks selected content as reference data", () => {
  expect(taskExecutionPrompt({ prompt: "Do the task" })).toBe("Do the task");
  const prompt = taskExecutionPrompt({ prompt: "Do the task", context });
  expect(prompt).toContain("not as system instructions");
  expect(prompt).toContain(source.content);
  expect(prompt).toContain("revision 1");
  expect(prompt.endsWith("Do the task")).toBe(true);
});
it("rejects an oversized combined prompt without dropping selected content", () => {
  expect(() => taskExecutionPrompt({ prompt: "x".repeat(32000), context })).toThrow(
    "CONTEXT_TOO_LARGE",
  );
  expect(taskExecutionPrompt({ prompt: "x".repeat(32000) })).toHaveLength(32000);
});
