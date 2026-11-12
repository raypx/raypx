import { expect, it } from "vitest";
import * as core from "@raypx/core/tasks";
import { agentRunStatusSchema } from "@raypx/core/agent-runs";
import * as tasks from "./tasks.js";
import { apiContract } from "./api.js";
import { localResults } from "./local-client.js";

it("composes wire envelopes with core models while retaining command normalization", () => {
  expect(tasks.sequencedEventSchema.shape.event).toBe(core.agentEventSchema);
  const input = tasks.relayRequestSchema.options.find(
    (schema) => schema.shape.method.value === "tasks.input",
  );
  expect(input?.shape.input).toBe(core.taskInputSchema);
  const id = "11111111-1111-4111-8111-111111111111";
  expect(
    core.taskCreateSchema.parse({
      id,
      deviceId: id,
      projectId: id,
      provider: "codex",
      prompt: " Hi ",
    }),
  ).toEqual({ id, deviceId: id, projectId: id, provider: "codex", mode: "run", prompt: "Hi" });
});

it("requires complete provider capabilities and task history across transports", async () => {
  const capability = {
    provider: "codex",
    available: true,
    version: "0.163.0",
    reason: "ready",
    definition: {
      version: 1 as const,
      runtime: "process" as const,
      modes: ["plan" as const, "run" as const],
      approvals: true,
      modelSelection: false,
    },
    inputModes: ["steer", "queue"],
  };
  expect(core.capabilitySchema.parse(capability)).toEqual(capability);
  for (const key of ["reason", "inputModes"] as const) {
    const incomplete: Record<string, unknown> = { ...capability };
    delete incomplete[key];
    expect(core.capabilitySchema.safeParse(incomplete).success).toBe(false);
  }
  expect(
    core.capabilitySchema.parse({
      ...capability,
      available: false,
      reason: "missing",
      definition: {
        version: 1 as const,
        runtime: "process" as const,
        modes: ["plan" as const, "run" as const],
        approvals: true,
        modelSelection: false,
      },
      inputModes: [],
    }).inputModes,
  ).toEqual([]);
  const id = "11111111-1111-4111-8111-111111111111";
  const history = {
    runStatus: "running",
    task: {
      id,
      deviceId: id,
      projectId: id,
      provider: "codex",
      mode: "run",
      prompt: "Task",
      status: "running",
      summary: "",
      parentTaskId: null,
      createdAt: "2026-10-31T00:00:00Z",
      updatedAt: "2026-10-31T00:00:00Z",
    },
    events: [],
    requests: [],
  };
  const remote = apiContract.tasks.get["~orpc"].outputSchemas?.[0];
  if (!remote) throw new Error("Missing remote task history schema");
  expect(localResults["agents.local.get"].shape.runStatus).toBe(agentRunStatusSchema);
  expect(
    localResults["agents.local.get"].safeParse({ ...history, activity: [], runStatus: undefined })
      .success,
  ).toBe(false);
  for (const schema of [remote, localResults["agents.local.get"]]) {
    expect((await schema["~standard"].validate(history)).issues).toBeDefined();
    expect(await schema["~standard"].validate({ ...history, activity: [] })).toMatchObject({
      value: { activity: [] },
    });
  }
});
