import { z } from "zod";

export const agentProviderSchema = z.enum(["claude", "codex"]);
export const questionSchema = z.object({
  id: z.string().max(300),
  text: z.string().max(8000),
  multiSelect: z.boolean(),
  options: z
    .array(z.object({ label: z.string().max(1000), description: z.string().max(8000) }))
    .max(20),
});
export const decisionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("allow") }),
  z.object({ type: z.literal("deny"), note: z.string().max(8000).default("") }),
  z.object({
    type: z.literal("answer"),
    answers: z.record(z.string(), z.array(z.string().max(8000)).max(20)),
  }),
]);
