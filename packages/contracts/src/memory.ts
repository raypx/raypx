import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
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
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(z.strictObject({}))
    .output(z.array(contextDocumentSummarySchema).max(100)),
  get: httpRead("/memory/documents/{id}", "memory", "Read a memory document")
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(z.strictObject({ id: z.uuid() }))
    .output(contextDocumentSchema),
  create: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextCreateSchema)
    .output(contextDocumentSchema),
  update: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextUpdateSchema)
    .output(contextDocumentSchema),
  archive: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextArchiveSchema)
    .output(contextDocumentSchema),
  delete: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextDeleteSchema)
    .output(contextDeleteResultSchema),
  history: httpRead("/memory/documents/{id}/revisions", "memory", "Read memory document revisions")
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextHistorySchema)
    .output(z.array(contextVersionSchema).max(20)),
  restore: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(contextRestoreSchema)
    .output(contextDocumentSchema),
  resolve: oc
    .meta(exposeApiTo("renderer"), rpcAccess("memory.manage"))
    .input(
      z.strictObject({
        selection: taskContextSelectionSchema,
        target: taskContextTargetSchema,
        prompt: z.string().min(1).max(32_000).optional(),
      }),
    )
    .output(taskContextSnapshotSchema),
};
