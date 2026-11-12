import { expect, it } from "vitest";
import {
  canCreateTask,
  followUpPlan,
  prepareTaskSubmission,
  taskSelection,
  canContinueTask,
  continueTaskFailure,
} from "./composition.js";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { AgentTask } from "@raypx/core/tasks";
it("refuses an unavailable capability and requires a model according to the definition", () => {
  const selection = taskSelection([], "device", "project", "codex");
  expect(canCreateTask(selection, "run", undefined, false)).toBe(false);
  const device: SyncDevice = {
    id: "device",
    name: "",
    platform: "test",
    appVersion: "",
    epoch: 1,
    revoked: false,
    online: true,
    lastSeenAt: null,
    projects: [{ id: "project", name: "test", providers: ["codex"], dirty: false }],
    capabilities: [
      {
        provider: "codex",
        version: "1",
        reason: "ready",
        available: true,
        inputModes: ["queue"],
        definition: {
          version: 1,
          runtime: "sdk",
          modes: ["run"],
          approvals: true,
          modelSelection: true,
        },
      },
    ],
  };
  const sdk = taskSelection([device], "device", "project", "codex");
  expect(canCreateTask(sdk, "run", undefined, true)).toBe(false);
  expect(
    canCreateTask(
      sdk,
      "plan",
      { provider: "test", model: "a", connectionId: "a".repeat(64) },
      true,
    ),
  ).toBe(false);
  expect(
    canCreateTask(sdk, "run", { provider: "test", model: "a", connectionId: "a".repeat(64) }, true),
  ).toBe(true);
});

it("explains continuation failures without confusing missing devices, offline devices, capabilities and models", () => {
  const task: AgentTask = {
    id: "task",
    deviceId: "device",
    projectId: "project",
    provider: "codex",
    mode: "run",
    prompt: "Continue",
    status: "succeeded",
    summary: "",
    parentTaskId: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
  };
  const device: SyncDevice = {
    id: "device",
    name: "Computer",
    platform: "test",
    appVersion: "test",
    epoch: 1,
    revoked: false,
    online: true,
    lastSeenAt: null,
    projects: [{ id: "project", name: "Project", providers: ["codex"], dirty: false }],
    capabilities: [
      {
        provider: "codex",
        available: true,
        version: "1",
        reason: "ready",
        inputModes: [],
        definition: {
          version: 1,
          runtime: "sdk",
          modes: ["run"],
          approvals: true,
          modelSelection: true,
        },
      },
    ],
  };
  const model = { provider: "provider", model: "model", connectionId: "a".repeat(64) };
  const continuation = { revision: 1, blocked: false, model };
  expect(continueTaskFailure(task, continuation, [], true, model)).toBe("SESSION_UNAVAILABLE");
  expect(continueTaskFailure(task, continuation, [{ ...device, revoked: true }], true, model)).toBe(
    "DEVICE_REVOKED",
  );
  expect(continueTaskFailure(task, continuation, [{ ...device, online: false }], true, model)).toBe(
    "DEVICE_OFFLINE",
  );
  expect(continueTaskFailure(task, continuation, [{ ...device, projects: [] }], true, model)).toBe(
    "projectUnavailableHint",
  );
  expect(
    continueTaskFailure(task, continuation, [{ ...device, capabilities: [] }], true, model),
  ).toBe("AGENT_UNAVAILABLE");
  expect(continueTaskFailure(task, continuation, [device], true)).toBe("AI_NOT_CONFIGURED");
  expect(continueTaskFailure(task, continuation, [device], false, model)).toBe(
    "AI_MODEL_NOT_FOUND",
  );
  expect(continueTaskFailure(task, undefined, [device], true, model)).toBe("SESSION_UNAVAILABLE");
  expect(continueTaskFailure(task, { ...continuation, blocked: true }, [device], true, model)).toBe(
    "PI_RECOVERY_REQUIRED",
  );
  expect(canContinueTask(task, continuation, [device], true, model)).toBe(true);
});
it("retains an uncertain submission until its input changes and binds transfers to the inspected revision", () => {
  const input = {
    deviceId: "device",
    projectId: "project",
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "First",
  };
  const sent = prepareTaskSubmission(null, input, "draft", () => "command-1");
  expect(
    prepareTaskSubmission(sent, { ...input }, "edited-draft", () => {
      throw new Error("must not resend");
    }),
  ).toBe(sent);
  expect(
    prepareTaskSubmission(sent, { ...input, prompt: "Changed" }, "draft", () => "command-2").id,
  ).toBe("command-2");
  const original = { provider: "test", model: "a", connectionId: "a".repeat(64) };
  const changed = { ...original, connectionId: "b".repeat(64) };
  const plan = followUpPlan("next", "parent", "Continue", changed, {
    revision: 7,
    model: original,
    blocked: false,
  });
  expect(plan.transfer).toBe(true);
  expect(plan.input.contextTransfer).toEqual({ revision: 7, connectionId: changed.connectionId });
  expect(
    followUpPlan("next", "parent", "Continue", original, {
      revision: 7,
      model: original,
      blocked: false,
    }).transfer,
  ).toBe(false);
});
