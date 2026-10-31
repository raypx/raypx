import { oc } from "@orpc/contract";
import { z } from "zod";
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
} from "@raypx/memory";

/** Account context documents and immutable revisions; no client-selected owner. */
export const memoryContract = {
  list: oc.input(z.strictObject({})).output(z.array(contextDocumentSummarySchema).max(100)),
  get: oc.input(z.strictObject({ id: z.uuid() })).output(contextDocumentSchema),
  create: oc.input(contextCreateSchema).output(contextDocumentSchema),
  update: oc.input(contextUpdateSchema).output(contextDocumentSchema),
  archive: oc.input(contextArchiveSchema).output(contextDocumentSchema),
  delete: oc.input(contextDeleteSchema).output(contextDeleteResultSchema),
  history: oc.input(contextHistorySchema).output(z.array(contextVersionSchema).max(20)),
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
