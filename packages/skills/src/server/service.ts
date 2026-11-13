import { z } from "zod";
import {
  MAX_ENABLED_SKILLS,
  SkillError,
  skillAvailabilitySchema,
  skillContentSchema,
  skillIdSchema,
  skillImportInputSchema,
  type SkillAvailability,
  type SkillCatalogEntry,
  type SkillContent,
} from "@raypx/core/skills";
import type { SkillRepository, SkillsService } from "./types.js";
import { importSkillPackage } from "./import.js";

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SkillError("SKILL_INVALID");
  return result.data;
}
function catalog(skills: { id: string; name: string; description: string }[]): SkillCatalogEntry[] {
  const result = skills.map(({ id, name, description }) => ({ id, name, description }));
  if (result.length > MAX_ENABLED_SKILLS || JSON.stringify(result).length > 8_000)
    throw new SkillError("SKILL_LIMIT");
  return result;
}
export function createSkillsService(repository: SkillRepository): SkillsService {
  return {
    list: (scope, availableOnly = false) => repository.list(scope, availableOnly),
    get: (scope, id) => repository.get(scope, parse(skillIdSchema, id), false),
    create: (scope, content, availability: SkillAvailability = { mode: "all" }) =>
      repository.create(
        scope,
        crypto.randomUUID(),
        parse(skillContentSchema, content),
        parse(skillAvailabilitySchema, availability),
      ),
    update: (scope, id, content) =>
      repository.update(scope, parse(skillIdSchema, id), parse(skillContentSchema, content)),
    delete: (scope, id) => repository.delete(scope, parse(skillIdSchema, id)),
    setAvailability: (scope, id, availability) =>
      repository.setAvailability(
        scope,
        parse(skillIdSchema, id),
        parse(skillAvailabilitySchema, availability),
      ),
    async setAgentSkills(scope, agentId, ids) {
      const parsed = parse(
        z
          .array(skillIdSchema)
          .max(MAX_ENABLED_SKILLS)
          .refine((items) => new Set(items).size === items.length),
        ids,
      );
      const available = await repository.list(scope, true);
      const selected = parsed.map((id) => available.find((item) => item.id === id));
      if (selected.some((item) => !item)) throw new SkillError("SKILL_NOT_FOUND");
      catalog(selected.filter((item) => item !== undefined));
      return repository.setEnabled(scope, agentId, parsed);
    },
    async runCatalog(scope, agentId) {
      return catalog(await repository.enabled(scope, agentId));
    },
    async loadForRun(scope, agentId, id) {
      const found = (await repository.enabled(scope, agentId)).find((skill) => skill.id === id);
      if (!found) throw new SkillError("SKILL_NOT_FOUND");
      return found;
    },
    saveFromRun: (scope, actor, callId, id, content: SkillContent) =>
      repository.saveFromRun(
        scope,
        actor,
        callId,
        id === undefined ? undefined : parse(skillIdSchema, id),
        parse(skillContentSchema, content),
      ),
    async import(scope, input, availability: SkillAvailability = { mode: "all" }) {
      const parsed = parse(skillImportInputSchema, input);
      const imported = importSkillPackage(parsed);
      const skill = await repository.create(
        scope,
        crypto.randomUUID(),
        imported.content,
        parse(skillAvailabilitySchema, availability),
      );
      return { skill, omitted: imported.omitted };
    },
  };
}
