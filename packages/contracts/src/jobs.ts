import { exposeApiTo } from "./exposure.js";
import { rpcAccess } from "./policy.js";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { httpRead } from "./http.js";
import {
  cloudJobCreateSchema,
  cloudJobInputSchema,
  cloudJobSchema,
  cloudJobRunSchema,
} from "@raypx/core/jobs";

/** Account-owned schedules; no caller-selected actor or arbitrary server command. */
export const jobsContract = {
  list: httpRead("/jobs", "jobs", "List automations")
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(z.object({}))
    .output(z.object({ enabled: z.boolean(), jobs: z.array(cloudJobSchema).max(100) })),
  create: oc
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(cloudJobCreateSchema)
    .output(cloudJobSchema),
  update: oc
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(
      z.strictObject({
        id: z.uuid(),
        revision: z.number().int().positive(),
        job: cloudJobInputSchema,
      }),
    )
    .output(cloudJobSchema),
  remove: oc
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(z.strictObject({ id: z.uuid(), revision: z.number().int().positive() }))
    .output(z.object({ deleted: z.literal(true) })),
  run: oc
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(z.strictObject({ id: z.uuid(), requestId: z.uuid() }))
    .output(cloudJobRunSchema),
  history: httpRead("/jobs/{id}/runs", "jobs", "Read automation run history")
    .meta(exposeApiTo("renderer"), rpcAccess("automations.manage"))
    .input(z.strictObject({ id: z.uuid(), limit: z.number().int().min(1).max(100).default(50) }))
    .output(z.array(cloudJobRunSchema).max(100)),
};
