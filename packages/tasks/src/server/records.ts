import { z } from "zod";
import { agentEventSchema, humanRequestSchema, taskSchema } from "@raypx/core/tasks";

/** Stored read projections; execution and its journal remain device-owned. */
export const taskProjectionSchemas = {
  task: taskSchema.extend({ epoch: z.number().int().positive() }),
  request: humanRequestSchema.extend({ deviceId: z.string().min(1) }),
  event: z.object({
    id: z.string().min(1),
    deviceId: z.string().min(1),
    taskId: z.uuid(),
    streamId: z.string(),
    cursor: z.number().int().nonnegative(),
    event: agentEventSchema,
  }),
};

export type TaskProjectionRecords = {
  [Kind in keyof typeof taskProjectionSchemas]: z.output<(typeof taskProjectionSchemas)[Kind]>;
};
