import { z } from "zod";

export const agentProviderSchema = z.enum(["claude", "codex"]);
export const agentProviders = agentProviderSchema.options;
/** Pure presentation metadata. Runtime availability is discovered independently. */
export const agentProviderMetadata = {
  claude: { label: "Claude Code", shortLabel: "Claude", inputHint: "claudeInputHint" },
  codex: { label: "Codex", shortLabel: "Codex", inputHint: "codexInputHint" },
} as const satisfies Record<
  z.infer<typeof agentProviderSchema>,
  {
    label: string;
    shortLabel: string;
    inputHint: string;
  }
>;
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
