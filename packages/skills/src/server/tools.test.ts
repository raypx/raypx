import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { spaceIdSchema } from "@raypx/core/spaces";
import type { Skill } from "@raypx/core/skills";
import type { SpaceScope } from "@raypx/spaces/server";
import type { SkillsService } from "./types.js";
import { createSkillTools } from "./tools.js";

const agentId = agentIdSchema.parse("agent");
const spaceId = spaceIdSchema.parse("space");
const scope = {
  spaceId,
  member: { spaceId, accountId: "owner", role: "owner", createdAt: "2026-11-01T00:00:00Z" },
} as SpaceScope;
function fixture(body = "Learned fact") {
  const load = vi.fn(
    async () =>
      ({ id: "skill", name: "Reference", description: "Reference know-how", body }) as Skill,
  );
  const save = vi.fn(async () => ({ id: "learned" }));
  const service = { loadForRun: load, saveFromRun: save } as unknown as SkillsService;
  const tools = createSkillTools(service);
  const actor = {
    agentId,
    runId: "run",
    memberAccountId: "owner",
    execution: { conversationId: "conversation", ownerId: "worker", fence: 7 },
  };
  return { tools, load, save, actor };
}
it("classifies saving as a change and loading as read without exposing content in metadata", () => {
  const { tools } = fixture();
  const save = tools.prepare({
    id: "save",
    name: "agent_skill_save",
    arguments: { name: "Learned", description: "Know-how", body: "private body" },
  });
  expect(save.changes).toBe(true);
  expect(save.argumentSummary).not.toContain("private body");
  const read = tools.prepare({ id: "read", name: "agent_skill_load", arguments: { id: "skill" } });
  expect(read.changes).toBe(false);
  expect(() => tools.prepare({ id: "bad", name: "run", arguments: {} })).toThrow("SKILL_INVALID");
  expect(() =>
    tools.prepare({
      id: "huge",
      name: "agent_skill_save",
      arguments: { name: "Skill", description: "Reference", body: "\u0001".repeat(64_000) },
    }),
  ).toThrow("SKILL_INVALID");
});
it("labels skill text untrusted, bounds JSON output and supports adjacent continuation", async () => {
  const { tools, actor } = fixture("\u0001".repeat(20_000));
  const call = tools.prepare({ id: "read", name: "agent_skill_load", arguments: { id: "skill" } });
  const first = await tools.execute(scope, actor, call, new AbortController().signal);
  expect(first.length).toBeLessThanOrEqual(MAX_TOOL_RESULT);
  const parsed = JSON.parse(first);
  expect(parsed.untrusted).toBe(true);
  expect(parsed.nextOffset).toBe(parsed.body.length);
  const second = tools.prepare({
    id: "read2",
    name: "agent_skill_load",
    arguments: { id: "skill", offset: parsed.nextOffset },
  });
  expect(
    JSON.parse(await tools.execute(scope, actor, second, new AbortController().signal)).offset,
  ).toBe(parsed.nextOffset);
});
it("saves only through the fenced port and does no work after cancellation", async () => {
  const { tools, actor, save, load } = fixture();
  const call = tools.prepare({
    id: "save",
    name: "agent_skill_save",
    arguments: { name: "Learned", description: "Know-how", body: "Fact" },
  });
  expect(
    JSON.parse(await tools.execute(scope, actor, call, new AbortController().signal)),
  ).toMatchObject({ untrusted: true, id: "learned" });
  expect(save).toHaveBeenCalledWith(scope, actor, "save", undefined, {
    name: "Learned",
    description: "Know-how",
    body: "Fact",
  });
  const controller = new AbortController();
  controller.abort();
  expect(JSON.parse(await tools.execute(scope, actor, call, controller.signal)).state).toBe(
    "cancelled",
  );
  expect(save).toHaveBeenCalledTimes(1);
  expect(load).not.toHaveBeenCalled();
});
