import { oc } from "@orpc/contract";
import { z } from "zod";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  MAX_ENABLED_SKILLS,
  skillIdSchema,
  skillSchema,
  skillCatalogEntrySchema,
  skillContentSchema,
  skillAvailabilitySchema,
  skillImportInputSchema,
  skillImportResultSchema,
} from "@raypx/core/skills";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema, id: skillIdSchema });
export const skillsContract = {
  list: session
    .input(z.strictObject({ spaceId: spaceIdSchema, availableOnly: z.boolean().default(false) }))
    .output(z.array(skillSchema)),
  get: session.input(selection).output(skillSchema),
  create: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        skill: skillContentSchema,
        availability: skillAvailabilitySchema.default({ mode: "all" }),
      }),
    )
    .output(skillSchema),
  update: session.input(selection.extend({ skill: skillContentSchema })).output(skillSchema),
  delete: session.input(selection).output(z.strictObject({ deleted: z.literal(true) })),
  setAvailability: session
    .input(selection.extend({ availability: skillAvailabilitySchema }))
    .output(skillSchema),
  agentSkills: session
    .input(z.strictObject({ spaceId: spaceIdSchema, agentId: agentIdSchema }))
    .output(z.array(skillCatalogEntrySchema)),
  setAgentSkills: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        agentId: agentIdSchema,
        ids: z
          .array(skillIdSchema)
          .max(MAX_ENABLED_SKILLS)
          .refine((ids) => new Set(ids).size === ids.length),
      }),
    )
    .output(z.array(skillCatalogEntrySchema)),
  import: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        package: skillImportInputSchema,
        availability: skillAvailabilitySchema.default({ mode: "all" }),
      }),
    )
    .output(skillImportResultSchema),
};
