import { expect, it } from "vite-plus/test";
import * as core from "@raypx/core";
import * as tasks from "../src/tasks.js";

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
