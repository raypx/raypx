import { z } from "zod";
import { taskContextTargetSchema } from "@raypx/core/tasks";

/** Device and account stores share the format, never their ownership namespace. */
export const contextDocumentInputSchema = z.strictObject({
  kind: z.enum(["memory", "template"]),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80),
  content: z.string().trim().min(1).max(8_000),
  project: taskContextTargetSchema.nullable(),
});
export const contextDocumentSummarySchema = contextDocumentInputSchema
  .omit({ content: true })
  .extend({
    id: z.uuid(),
    revision: z.number().int().positive(),
    archived: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  });
export const contextDocumentSchema = contextDocumentSummarySchema.extend({
  content: z.string().min(1).max(8_000),
});
export const contextVersionSchema = contextDocumentSchema.extend({
  reason: z.enum(["created", "updated", "archived", "restored"]),
  restoredFrom: z.number().int().positive().optional(),
});
export const contextCreateSchema = z.strictObject({
  requestId: z.uuid(),
  document: contextDocumentInputSchema,
});
export const contextUpdateSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
  document: contextDocumentInputSchema,
});
export const contextArchiveSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
  archived: z.boolean(),
});
export const contextHistorySchema = z.strictObject({
  id: z.uuid(),
  before: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).default(20),
});
export const contextRestoreSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().positive(),
  version: z.number().int().positive(),
});
export type ContextDocumentInput = z.infer<typeof contextDocumentInputSchema>;
export type ContextDocumentSummary = z.infer<typeof contextDocumentSummarySchema>;
export type ContextDocument = z.infer<typeof contextDocumentSchema>;
export type ContextVersion = z.infer<typeof contextVersionSchema>;
export type ContextCreateInput = z.input<typeof contextCreateSchema>;
export type ContextUpdateInput = z.input<typeof contextUpdateSchema>;
export type ContextArchiveInput = z.input<typeof contextArchiveSchema>;
export type ContextHistoryInput = z.input<typeof contextHistorySchema>;
export type ContextRestoreInput = z.input<typeof contextRestoreSchema>;
