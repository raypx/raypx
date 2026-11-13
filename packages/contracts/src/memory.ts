import { oc } from "@orpc/contract";
import { z } from "zod";
import { httpRead } from "./http.js";
import {
  taskContextSelectionSchema,
  taskContextSnapshotSchema,
  taskContextTargetSchema,
} from "@raypx/core/tasks";
import {
  contextCreateSchema,
  contextUpdateSchema,
  contextArchiveSchema,
  contextDeleteSchema,
  contextDeleteResultSchema,
  contextHistorySchema,
  contextRestoreSchema,
  contextDocumentSummarySchema,
  contextDocumentSchema,
  contextVersionSchema,
} from "@raypx/core/memory";

/** Account context documents and immutable revisions; no client-selected owner. */
export const memoryContract = {
  list: httpRead("/memory/documents", "memory", "List memory documents")
    .input(z.strictObject({}))
    .output(z.array(contextDocumentSummarySchema).max(100)),
  get: httpRead("/memory/documents/{id}", "memory", "Read a memory document")
    .input(z.strictObject({ id: z.uuid() }))
    .output(contextDocumentSchema),
  create: oc.input(contextCreateSchema).output(contextDocumentSchema),
  update: oc.input(contextUpdateSchema).output(contextDocumentSchema),
  archive: oc.input(contextArchiveSchema).output(contextDocumentSchema),
  delete: oc.input(contextDeleteSchema).output(contextDeleteResultSchema),
  history: httpRead("/memory/documents/{id}/revisions", "memory", "Read memory document revisions")
    .input(contextHistorySchema)
    .output(z.array(contextVersionSchema).max(20)),
  restore: oc.input(contextRestoreSchema).output(contextDocumentSchema),
  resolve: oc
    .input(
      z.strictObject({
        selection: taskContextSelectionSchema,
        target: taskContextTargetSchema,
        prompt: z.string().min(1).max(32_000).optional(),
      }),
    )
    .output(taskContextSnapshotSchema),
};
