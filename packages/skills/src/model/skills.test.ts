import { expect, it, vi } from "vitest";
import { spaceIdSchema } from "@raypx/core/spaces";
import { skillSchema } from "@raypx/core/skills";
import {
  SkillsController,
  beginSkillEdit,
  skillFormContent,
  skillImportPackage,
  type SkillsPort,
} from "./skills.js";
const spaceId = spaceIdSchema.parse("space-one");
const skill = skillSchema.parse({
  id: "skill-one",
  name: "Research",
  description: "Compare sources",
  body: "# Research",
  ownership: "account",
  spaceId: null,
  agentId: null,
  availability: { mode: "all" },
  createdAt: "2026-11-14T00:00:00Z",
  updatedAt: "2026-11-14T00:00:00Z",
});
function port(): SkillsPort {
  return {
    list: vi.fn(async () => [skill]),
    get: vi.fn(async () => skill),
    create: vi.fn(async ({ skill: content, availability }) => ({
      ...skill,
      ...content,
      availability,
    })),
    update: vi.fn(async ({ skill: content }) => ({ ...skill, ...content })),
    delete: vi.fn(async () => ({ deleted: true as const })),
    setAvailability: vi.fn(async ({ availability }) => ({ ...skill, availability })),
    import: vi.fn(async () => ({
      skill,
      omitted: [{ name: "scripts/collect.sh", reason: "EXECUTABLE_OR_UNSUPPORTED" as const }],
    })),
  };
}
it("validates forms without mutating the original skill, retaining the draft on failure", async () => {
  const client = port();
  const controller = new SkillsController(client, spaceId);
  const editor = beginSkillEdit(skill);
  editor.draft.name = "  New research  ";
  expect(skill.name).toBe("Research");
  expect(skillFormContent(editor.draft)?.name).toBe("New research");
  client.update = vi.fn(async () => {
    throw new Error("private server detail");
  });
  expect(await controller.save(editor)).toBe(false);
  expect(editor.draft.name).toBe("  New research  ");
  expect(controller.getSnapshot().error).toBe("save");
  expect(JSON.stringify(controller.getSnapshot())).not.toContain("private server detail");
  editor.draft.description = " ";
  expect(skillFormContent(editor.draft)).toBeNull();
});
it("creates a skill with explicit availability and updates availability through its own procedure", async () => {
  const client = port();
  const controller = new SkillsController(client, spaceId);
  const editor = beginSkillEdit(null);
  editor.draft = { name: "Research", description: "Compare sources", body: "# Research" };
  editor.availability = { mode: "selected", spaceIds: [spaceId] };
  expect(await controller.save(editor)).toBe(true);
  expect(client.create).toHaveBeenCalledWith({
    spaceId,
    skill: editor.draft,
    availability: editor.availability,
  });
  const edit = beginSkillEdit(skill);
  edit.availability = { mode: "selected", spaceIds: [] };
  expect(await controller.save(edit)).toBe(true);
  expect(client.setAvailability).toHaveBeenCalledWith({
    spaceId,
    id: skill.id,
    availability: edit.availability,
  });
  expect(controller.getSnapshot().skills[0]?.availability).toEqual(edit.availability);
});
it("encodes bounded Markdown or ZIP bytes, preserving the backend import report by name", async () => {
  const bytes = new TextEncoder().encode(
    "---\nname: Research\ndescription: Compare sources\n---\n# Research",
  );
  expect(skillImportPackage("SKILL.md", bytes)).toEqual({
    format: "markdown",
    bytes: btoa(new TextDecoder().decode(bytes)),
  });
  expect(skillImportPackage("archive.ZIP", bytes)?.format).toBe("zip");
  expect(skillImportPackage("script.sh", bytes)).toBeNull();
  expect(skillImportPackage("SKILL.md", new Uint8Array())).toBeNull();
  expect(skillImportPackage("skill.zip", new Uint8Array(2_097_153))).toBeNull();
  const client = port();
  const controller = new SkillsController(client, spaceId);
  await controller.importFile({
    name: "SKILL.md",
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer,
  });
  expect(controller.getSnapshot().report?.skill.name).toBe("Research");
  expect(controller.getSnapshot().report?.omitted).toEqual([
    { name: "scripts/collect.sh", reason: "EXECUTABLE_OR_UNSUPPORTED" },
  ]);
  expect(controller.getSnapshot().skills[0]?.id).toBe(skill.id);
  controller.closeReport();
  expect(controller.getSnapshot().report).toBeNull();
});
it("does not upload invalid files or apply completion after disposal", async () => {
  const client = port();
  const controller = new SkillsController(client, spaceId);
  await controller.importFile({ name: "command.sh", size: 1, arrayBuffer: vi.fn() });
  expect(client.import).not.toHaveBeenCalled();
  expect(controller.getSnapshot().error).toBe("invalidFile");
  let finish!: (value: (typeof skill)[]) => void;
  client.list = vi.fn(
    () =>
      new Promise<(typeof skill)[]>((resolve) => {
        finish = resolve;
      }),
  );
  const load = controller.load();
  controller.dispose();
  finish([skill]);
  await load;
  expect(controller.getSnapshot().skills).toEqual([]);
});
