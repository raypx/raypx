import { expect, it, vi } from "vitest";
import {
  ComputerToolsError,
  StaleRunFenceError,
  type ComputerTools,
  type ExecutionRun,
} from "@raypx/agents/server";
import { runSchema } from "@raypx/core/conversation";
import { skillSchema } from "@raypx/core/skills";
import { spaceIdSchema, spaceMemberSchema } from "@raypx/core/spaces";
import { SkillExecutionFenceError, type SkillsService } from "@raypx/skills/server";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { withSkillTools } from "./skill-tools.js";

function fixture() {
  const at = "2026-11-01T00:00:00.000Z";
  const spaceId = spaceIdSchema.parse("space");
  const scope = resolveSpaceScope(
    spaceMemberSchema.parse({ spaceId, accountId: "account", role: "owner", createdAt: at }),
    "account",
    spaceId,
  );
  const run: ExecutionRun = {
    ...runSchema.parse({
      id: "run",
      spaceId,
      conversationId: "conversation",
      agentId: "agent",
      trigger: "routine",
      messageId: "message",
      memberAccountId: "account",
      model: { modelId: "fixture" },
      state: "running",
      failureCode: null,
      createdAt: at,
      startedAt: at,
      firstResponseAt: null,
      finishedAt: null,
    }),
    ownerId: "worker",
    fence: 7,
    attemptId: "attempt",
    attemptNumber: 1,
    timeoutAt: "2026-11-01T00:05:00.000Z",
    connectionId: null,
    computerId: null,
    computerGeneration: null,
  };
  const record = skillSchema.parse({
    id: "skill",
    name: "Skill",
    description: "Know-how",
    body: "Private body",
    ownership: "space",
    spaceId,
    agentId: run.agentId,
    availability: { mode: "selected", spaceIds: [spaceId] },
    createdAt: at,
    updatedAt: at,
  });
  const load = vi.fn<SkillsService["loadForRun"]>().mockResolvedValue(record);
  const save = vi.fn<SkillsService["saveFromRun"]>().mockResolvedValue({ id: "skill" });
  const service = { loadForRun: load, saveFromRun: save } as unknown as SkillsService;
  const computer: ComputerTools = {
    definitions: () => [],
    prepare: (call) => ({
      id: call.id,
      name: "computer_read_file",
      arguments: call.arguments,
      argumentSummary: "Read",
      target: "file",
      changes: false,
    }),
    execute: async () => "computer-result",
    cancel: async () => {},
    release: () => {},
  };
  const secrets: string[] = [];
  return {
    scope,
    run,
    load,
    save,
    secrets,
    tools: withSkillTools(computer, service, () => secrets),
    signal: new AbortController().signal,
  };
}
const content = { name: "Skill", description: "Know-how", body: "Private body" };
it("keeps routine skill saves as changes and carries the current attempt fence", async () => {
  const f = fixture();
  const call = f.tools.prepare({
    type: "toolCall",
    id: "save",
    name: "agent_skill_save",
    arguments: content,
  });
  expect(call.changes).toBe(true);
  expect(call.argumentSummary).not.toContain(content.body);
  expect(JSON.parse(await f.tools.execute(f.scope, f.run, call, f.signal))).toMatchObject({
    untrusted: true,
    state: "succeeded",
    id: "skill",
  });
  expect(f.save).toHaveBeenCalledWith(
    f.scope,
    {
      agentId: f.run.agentId,
      runId: f.run.id,
      memberAccountId: "account",
      execution: { conversationId: "conversation", ownerId: "worker", fence: 7 },
    },
    "save",
    undefined,
    content,
  );
  f.save.mockRejectedValueOnce(new SkillExecutionFenceError());
  await expect(f.tools.execute(f.scope, f.run, call, f.signal)).rejects.toBeInstanceOf(
    StaleRunFenceError,
  );
});
it("rejects secrets in inputs before writes and outputs before return", async () => {
  const f = fixture();
  f.secrets.push("credential-value");
  expect(() =>
    f.tools.prepare({
      type: "toolCall",
      id: "save",
      name: "agent_skill_save",
      arguments: { ...content, body: "credential-value" },
    }),
  ).toThrow(ComputerToolsError);
  expect(f.save).not.toHaveBeenCalled();
  const call = f.tools.prepare({
    type: "toolCall",
    id: "read",
    name: "agent_skill_load",
    arguments: { id: "skill" },
  });
  const record = await f.load(f.scope, f.run.agentId, "skill");
  f.load.mockResolvedValueOnce({ ...record, body: "credential-value" });
  await expect(f.tools.execute(f.scope, f.run, call, f.signal)).rejects.toMatchObject({
    code: "SECRET_OUTPUT",
  });
});
