import { oc } from "@orpc/contract";
import { z } from "zod";
import { agentIdSchema } from "@raypx/core/agents";
import {
  pageIdSchema,
  pageInputSchema,
  pageSchema,
  pageVersionSchema,
  pageShareLinkSchema,
} from "@raypx/core/pages";
import { spaceIdSchema } from "@raypx/core/spaces";
import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";

const session = oc.meta(exposeApiTo("renderer"), rpcAccess("session"));
const selection = z.strictObject({ spaceId: spaceIdSchema, id: pageIdSchema });
const edit = selection.extend({ expectedVersion: z.number().int().positive() });
export const pagesContract = {
  list: session
    .input(
      z.strictObject({
        spaceId: spaceIdSchema,
        agentId: agentIdSchema.optional(),
        limit: z.number().int().min(1).max(100).default(100),
      }),
    )
    .output(z.array(pageSchema)),
  get: session
    .input(selection.extend({ version: z.number().int().positive().optional() }))
    .output(pageVersionSchema),
  create: session
    .input(z.strictObject({ spaceId: spaceIdSchema, page: pageInputSchema }))
    .output(pageVersionSchema),
  update: session
    .input(edit.extend({ body: pageInputSchema.shape.body }))
    .output(pageVersionSchema),
  rename: session
    .input(edit.extend({ title: pageInputSchema.shape.title }))
    .output(pageVersionSchema),
  delete: session.input(edit).output(z.strictObject({ deleted: z.literal(true) })),
  versions: session
    .input(selection.extend({ limit: z.number().int().min(1).max(100).default(100) }))
    .output(z.array(pageVersionSchema.omit({ body: true }))),
  restore: session
    .input(edit.extend({ version: z.number().int().positive() }))
    .output(pageVersionSchema),
  createShareLink: session
    .input(
      selection.extend({
        version: z.number().int().positive().nullable().default(null),
        expiresAt: z.iso.datetime().nullable().default(null),
      }),
    )
    .output(pageShareLinkSchema.extend({ token: z.string() })),
  shareLinks: session.input(selection).output(z.array(pageShareLinkSchema)),
  revokeShareLink: session
    .input(selection.extend({ linkId: z.string().min(1).max(128) }))
    .output(z.strictObject({ revoked: z.number().int().nonnegative() })),
  revokeShareLinks: session
    .input(selection)
    .output(z.strictObject({ revoked: z.number().int().nonnegative() })),
};
