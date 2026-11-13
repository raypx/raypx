import { z } from "zod";
import { taskSchema, taskReviewSchema, type TaskActivity } from "@raypx/core/tasks";

/**
 * The persisted task aggregate: a Core task plus this device's binding and the
 * provider session it continues. Storage validates this same model, so the shape
 * has one definition in the domain.
 */
export const tokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  cachedInputTokens: z.number().nonnegative(),
  cacheWriteInputTokens: z.number().nonnegative(),
});

export const localAgentTaskSchema = z.object({
  task: taskSchema,
  binding: z.string().min(1),
  sessionId: z.string().nullable(),
  review: taskReviewSchema.optional(),
  tokenUsage: tokenUsageSchema.optional(),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type LocalAgentTask = z.output<typeof localAgentTaskSchema>;

/** An activity entry as a writer accepts it, before order and revision are assigned. */
type Draft<T> = T extends unknown ? Omit<T, "order" | "revision"> : never;
export type ActivityDraft = Draft<TaskActivity>;

export const desktopBinding = (workspaceId: string) => `desktop:${workspaceId}`;
export const isDesktopBinding = (binding: string) => binding.startsWith("desktop:");
