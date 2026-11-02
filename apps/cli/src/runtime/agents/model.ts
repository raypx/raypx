import { z } from "zod";
import { taskSchema, type TaskActivity } from "@raypx/core/tasks";

export const tokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  cachedInputTokens: z.number().nonnegative(),
  cacheWriteInputTokens: z.number().nonnegative(),
});

/** Local execution identity and provider continuation; storage validates this same model. */
export const localAgentTaskSchema = z.object({
  task: taskSchema,
  binding: z.string().min(1),
  sessionId: z.string().nullable(),
  tokenUsage: tokenUsageSchema.optional(),
});

type Draft<T> = T extends unknown ? Omit<T, "order" | "revision"> : never;
export type ActivityDraft = Draft<TaskActivity>;
export type LocalAgentTask = z.output<typeof localAgentTaskSchema>;

export const desktopBinding = (workspaceId: string) => `desktop:${workspaceId}`;
export const isDesktopBinding = (binding: string) => binding.startsWith("desktop:");
