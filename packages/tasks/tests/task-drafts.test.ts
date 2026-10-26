import { expect, it } from "vite-plus/test";
import { readTaskDrafts, sameDraft, MAX_TASK_DRAFTS } from "../src/model.js";
const draft = {
  id: "draft-1",
  deviceId: "computer",
  projectId: "project",
  prompt: "Review the change",
  provider: "codex" as const,
  mode: "plan" as const,
  updatedAt: "2026-10-25T00:00:00.000Z",
};
it("restores only bounded, validated task inputs from device storage", () => {
  expect(readTaskDrafts(null)).toEqual([]);
  expect(readTaskDrafts(JSON.stringify([{ ...draft, executable: "do not use" }]))).toEqual([draft]);
  for (const value of [
    {},
    [draft, draft],
    [{ ...draft, prompt: " " }],
    [{ ...draft, prompt: "x".repeat(32001) }],
    [{ ...draft, provider: "external" }],
    [{ ...draft, provider: ["codex"] }],
    [{ ...draft, provider: null }],
    [{ ...draft, provider: {} }],
    [{ ...draft, mode: ["plan"] }],
    [{ ...draft, mode: null }],
    [{ ...draft, mode: {} }],
    [{ ...draft, updatedAt: "invalid" }],
    Array.from({ length: MAX_TASK_DRAFTS + 1 }, (_, index) => ({ ...draft, id: String(index) })),
  ]) {
    expect(() => readTaskDrafts(JSON.stringify(value))).toThrow(/Invalid/);
  }
  expect(() => readTaskDrafts("{invalid")).toThrow(SyntaxError);
});
it("detects edits to every execution parameter without treating metadata as content", () => {
  expect(sameDraft(draft, { ...draft })).toBe(true);
  for (const change of [
    { prompt: "Other task" },
    { deviceId: "other" },
    { projectId: "other" },
    { provider: "claude" as const },
    { mode: "run" as const },
  ]) {
    expect(sameDraft(draft, { ...draft, ...change })).toBe(false);
  }
});
it("preserves only selected source IDs and revisions without accepting a raw snapshot", () => {
  const source = { id: crypto.randomUUID(), revision: 3 };
  const input = {
    ...draft,
    contextSelection: { sources: [source] },
    context: { sources: [{ content: "injected" }] },
  };
  expect(readTaskDrafts(JSON.stringify([input]))).toEqual([
    { ...draft, contextSelection: { sources: [source] } },
  ]);
  expect(
    sameDraft(input, { ...input, contextSelection: { sources: [{ ...source, revision: 4 }] } }),
  ).toBe(false);
  for (const contextSelection of [
    { sources: [source, source] },
    { sources: Array.from({ length: 9 }, () => ({ id: crypto.randomUUID(), revision: 1 })) },
    { sources: [{ ...source, content: "injected" }] },
    { sources: [{ id: source.id, revision: 0 }] },
  ])
    expect(() => readTaskDrafts(JSON.stringify([{ ...draft, contextSelection }]))).toThrow(
      /sources/,
    );
});
