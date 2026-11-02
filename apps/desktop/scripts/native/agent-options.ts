import { agentProviderSchema, type AgentProvider } from "@raypx/core/tasks";

/** First-delivery acceptance needs Codex; other installed providers are opt-in. */
export function nativeAgentProviders(
  environment: Readonly<Record<string, string | undefined>>,
): AgentProvider[] {
  const names = (environment.RAYPX_LIVE_AGENT_PROVIDERS ?? "codex")
    .split(",")
    .map((name) => name.trim());
  if (new Set(names).size !== names.length)
    throw new Error("RAYPX_LIVE_AGENT_PROVIDERS must not repeat a provider");
  return names.map((name) => {
    const result = agentProviderSchema.safeParse(name);
    if (!result.success)
      throw new Error("RAYPX_LIVE_AGENT_PROVIDERS must select codex, claude or both");
    return result.data;
  });
}
