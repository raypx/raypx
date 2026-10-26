import { expect, it } from "vite-plus/test";
import * as core from "@raypx/core";
import * as tasks from "../src/tasks.js";
import * as text from "../src/task-text.js";

it("preserves task-domain exports as the core schema and rule instances", () => {
  const exports = [
    [tasks.agentProviderSchema, core.agentProviderSchema],
    [tasks.capabilitySchema, core.capabilitySchema],
    [tasks.questionSchema, core.questionSchema],
    [tasks.decisionSchema, core.decisionSchema],
    [tasks.taskModeSchema, core.taskModeSchema],
    [tasks.taskStatusSchema, core.taskStatusSchema],
    [tasks.activeTaskStatuses, core.activeTaskStatuses],
    [tasks.taskSchema, core.taskSchema],
    [tasks.taskContextSelectionSchema, core.taskContextSelectionSchema],
    [tasks.taskContextSnapshotSchema, core.taskContextSnapshotSchema],
    [tasks.taskContextTargetSchema, core.taskContextTargetSchema],
    [tasks.taskExecutionPrompt, core.taskExecutionPrompt],
    [tasks.humanRequestSchema, core.humanRequestSchema],
    [tasks.taskInputActivitySchema, core.taskInputActivitySchema],
    [tasks.taskActivitySchema, core.taskActivitySchema],
    [tasks.taskInputSchema, core.taskInputSchema],
    [tasks.agentEventSchema, core.agentEventSchema],
    [tasks.validDecision, core.validDecision],
    [tasks.taskActivityPage, core.taskActivityPage],
    [tasks.applyActivityEvent, core.applyActivityEvent],
    [tasks.taskText, core.taskText],
    [tasks.normalizeTaskJson, core.normalizeTaskJson],
  ] as const;
  for (const [compatibility, original] of exports) expect(compatibility).toBe(original);
  expect(text.taskText).toBe(core.taskText);
  expect(text.normalizeTaskJson).toBe(core.normalizeTaskJson);
});

it("composes wire envelopes with core models while retaining command normalization", () => {
  expect(tasks.sequencedEventSchema.shape.event).toBe(core.agentEventSchema);
  const input = tasks.relayRequestSchema.options.find(
    (schema) => schema.shape.method.value === "tasks.input",
  );
  expect(input?.shape.input).toBe(core.taskInputSchema);
  const id = "11111111-1111-4111-8111-111111111111";
  expect(
    tasks.taskCreateSchema.parse({
      id,
      deviceId: id,
      projectId: id,
      provider: "codex",
      prompt: " Hi ",
    }),
  ).toEqual({ id, deviceId: id, projectId: id, provider: "codex", mode: "run", prompt: "Hi" });
});
