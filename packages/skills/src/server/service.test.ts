import { expect, it, vi } from "vitest";
import { agentIdSchema } from "@raypx/core/agents";
import { skillSchema, type Skill } from "@raypx/core/skills";
import { spaceIdSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import { createSkillsService } from "./service.js";
import type { SkillRepository } from "./types.js";

const spaceId = spaceIdSchema.parse("space");
const agentId = agentIdSchema.parse("agent");
const scope = resolveSpaceScope(
  { spaceId, accountId: "owner", role: "owner", createdAt: "2026-11-01T00:00:00Z" },
  "owner",
  spaceId,
);
function record(id: string, description = "Know-how"): Skill {
  return skillSchema.parse({
    id,
    name: "Skill",
    description,
    body: "Private body",
    ownership: "account",
    spaceId: null,
    agentId: null,
    availability: { mode: "all" },
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
  });
}
function fixture(records: Skill[] = [record("skill")]) {
  const list = vi.fn(async () => records);
  const enabled = vi.fn(async () => records);
  const create = vi.fn(async () => records[0]!);
  const setEnabled = vi.fn(async () =>
    records.map(({ id, name, description }) => ({ id, name, description })),
  );
  const repository = { list, enabled, create, setEnabled } as unknown as SkillRepository;
  return { service: createSkillsService(repository), list, enabled, create, setEnabled };
}
it("construction performs no database or network I/O and catalog reveals no body", async () => {
  const f = fixture();
  expect(f.list).not.toHaveBeenCalled();
  expect(f.enabled).not.toHaveBeenCalled();
  expect(await f.service.runCatalog(scope, agentId)).toEqual([
    { id: "skill", name: "Skill", description: "Know-how" },
  ]);
  expect(JSON.stringify(await f.service.runCatalog(scope, agentId))).not.toContain("Private body");
});
it("enforces total catalog bounds and rejects unknown or duplicate selections before storing them", async () => {
  const f = fixture(
    Array.from({ length: 32 }, (_, index) => record(`skill-${index}`, "x".repeat(500))),
  );
  await expect(f.service.runCatalog(scope, agentId)).rejects.toThrow("SKILL_LIMIT");
  await expect(f.service.setAgentSkills(scope, agentId, ["missing"])).rejects.toThrow(
    "SKILL_NOT_FOUND",
  );
  await expect(f.service.setAgentSkills(scope, agentId, ["skill-0", "skill-0"])).rejects.toThrow(
    "SKILL_INVALID",
  );
  await expect(
    f.service.setAgentSkills(
      scope,
      agentId,
      Array.from({ length: 32 }, (_, i) => `skill-${i}`),
    ),
  ).rejects.toThrow("SKILL_LIMIT");
  expect(f.setEnabled).not.toHaveBeenCalled();
});
it("loads enabled text only and rejects oversized or invalid skill input", async () => {
  const f = fixture();
  await expect(f.service.loadForRun(scope, agentId, "missing")).rejects.toThrow("SKILL_NOT_FOUND");
  expect((await f.service.loadForRun(scope, agentId, "skill")).body).toBe("Private body");
  expect(() =>
    f.service.create(scope, { name: "Skill", description: "Text", body: "x".repeat(64_001) }),
  ).toThrow("SKILL_INVALID");
  expect(() =>
    f.service.create(scope, { name: "Skill", description: "Text", body: "bad\0text" }),
  ).toThrow("SKILL_INVALID");
  expect(f.create).not.toHaveBeenCalled();
});
it("imports a member's text through ordinary account ownership with explicit availability", async () => {
  const f = fixture();
  const bytes = Buffer.from("---\nname: Learned\ndescription: Know-how\n---\nUseful text").toString(
    "base64",
  );
  await f.service.import(scope, { format: "markdown", bytes }, { mode: "selected", spaceIds: [] });
  expect(f.create).toHaveBeenCalledWith(
    scope,
    expect.any(String),
    { name: "Learned", description: "Know-how", body: "Useful text" },
    { mode: "selected", spaceIds: [] },
  );
});
