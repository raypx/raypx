import { z } from "zod";
import { agentIdSchema } from "./agents.js";
import { spaceIdSchema } from "./spaces.js";
import { modelConnectionAvailabilitySchema } from "./model-connections.js";

export const MAX_SKILL_BODY = 64_000;
export const MAX_SKILL_PACKAGE_BYTES = 2_097_152;
export const MAX_ENABLED_SKILLS = 32;
export const skillIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const skillContentSchema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !value.includes("\0")),
  description: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((value) => !value.includes("\0")),
  body: z
    .string()
    .max(MAX_SKILL_BODY)
    .refine((value) => !value.includes("\0")),
});
export const skillAvailabilitySchema = modelConnectionAvailabilitySchema;
export const skillSchema = skillContentSchema.extend({
  id: skillIdSchema,
  ownership: z.enum(["account", "space"]),
  spaceId: spaceIdSchema.nullable(),
  agentId: agentIdSchema.nullable(),
  availability: skillAvailabilitySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const skillCatalogEntrySchema = skillSchema.pick({
  id: true,
  name: true,
  description: true,
});
export const skillImportInputSchema = z.strictObject({
  format: z.enum(["markdown", "zip"]),
  bytes: z
    .string()
    .max(Math.ceil(MAX_SKILL_PACKAGE_BYTES / 3) * 4)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
});
export const skillImportResultSchema = z.strictObject({
  skill: skillSchema,
  omitted: z
    .array(
      z.strictObject({ name: z.string().max(512), reason: z.literal("EXECUTABLE_OR_UNSUPPORTED") }),
    )
    .max(256),
});
export type Skill = z.infer<typeof skillSchema>;
export type SkillContent = z.infer<typeof skillContentSchema>;
export type SkillAvailability = z.infer<typeof skillAvailabilitySchema>;
export type SkillCatalogEntry = z.infer<typeof skillCatalogEntrySchema>;
export type SkillImportInput = z.infer<typeof skillImportInputSchema>;
export class SkillError extends Error {
  constructor(
    readonly code:
      | "SKILL_NOT_FOUND"
      | "SKILL_LIMIT"
      | "SKILL_INVALID"
      | "SKILL_PACKAGE_INVALID"
      | "SKILL_PACKAGE_TOO_LARGE"
      | "SKILL_PACKAGE_UNSAFE"
      | "SKILL_CONFLICT",
  ) {
    super(code);
    this.name = "SkillError";
  }
}
