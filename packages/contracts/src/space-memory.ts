import { oc } from "@orpc/contract";
import { z } from "zod";
import { agentIdSchema } from "@raypx/core/agents";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  spaceMemoryIdSchema,
  spaceMemoryInputSchema,
  spaceMemoryDocumentSchema,
  spaceMemoryRevisionSchema,
} from "@raypx/core/space-memory";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema, id: spaceMemoryIdSchema });
const edit = selection.extend({ expectedRevision: z.number().int().positive() });
export const spaceMemoryContract = {
  list: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        agentId: agentIdSchema.optional(),
        scope: z.enum(["agent", "space"]).optional(),
        includeRemoved: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(100),
      }),
    )
    .output(z.array(spaceMemoryDocumentSchema)),
  get: session.input(selection).output(spaceMemoryDocumentSchema),
  create: session
    .input(z.strictObject({ spaceId: spaceIdSchema, document: spaceMemoryInputSchema }))
    .output(spaceMemoryDocumentSchema),
  update: session
    .input(edit.extend({ document: spaceMemoryInputSchema }))
    .output(spaceMemoryDocumentSchema),
  remove: session.input(edit).output(spaceMemoryDocumentSchema),
  history: session
    .input(selection.extend({ limit: z.number().int().min(1).max(100).default(100) }))
    .output(z.array(spaceMemoryRevisionSchema)),
  restore: session
    .input(edit.extend({ revision: z.number().int().positive() }))
    .output(spaceMemoryDocumentSchema),
};
