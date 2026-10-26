import { oc } from "@orpc/contract";
import { z } from "zod";
import {
  cloudJobCreateSchema,
  cloudJobInputSchema,
  cloudJobSchema,
  cloudJobRunSchema,
} from "@raypx/jobs";

export {
  cloudJobCreateSchema,
  cloudJobActionSchema,
  cloudJobInputSchema,
  cloudJobSchema,
  cloudJobRunSchema,
} from "@raypx/jobs";
export type {
  CloudJobCreateInput,
  CloudJobAction,
  CloudJobInput,
  CloudJob,
  CloudJobRun,
} from "@raypx/jobs";

/** Account-owned schedules; no caller-selected actor or arbitrary server command. */
export const jobsContract = {
  list: oc
    .input(z.object({}))
    .output(z.object({ enabled: z.boolean(), jobs: z.array(cloudJobSchema).max(100) })),
  create: oc.input(cloudJobCreateSchema).output(cloudJobSchema),
  update: oc
    .input(
      z.strictObject({
        id: z.uuid(),
        revision: z.number().int().positive(),
        job: cloudJobInputSchema,
      }),
    )
    .output(cloudJobSchema),
  remove: oc
    .input(z.strictObject({ id: z.uuid(), revision: z.number().int().positive() }))
    .output(z.object({ deleted: z.literal(true) })),
  run: oc.input(z.strictObject({ id: z.uuid(), requestId: z.uuid() })).output(cloudJobRunSchema),
  history: oc
    .input(z.strictObject({ id: z.uuid(), limit: z.number().int().min(1).max(100).default(50) }))
    .output(z.array(cloudJobRunSchema).max(100)),
};
