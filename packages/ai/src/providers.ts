import {
  createProvider,
  envApiKeyAuth,
  type Model,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { AiError } from "./errors.js";

export function defaultProviders(): Provider[] {
  return [anthropicProvider(), openaiProvider(), googleProvider(), openrouterProvider()];
}

type CompatibleApi = "anthropic-messages" | "openai-completions" | "openai-responses";
export interface CompatibleProviderOptions {
  id: string;
  name?: string;
  baseUrl: string;
  api: CompatibleApi;
  apiKeyEnv?: string;
  models: readonly {
    id: string;
    name?: string;
    reasoning?: boolean;
    vision?: boolean;
    contextWindow?: number;
    maxTokens?: number;
  }[];
}

/** A caller-selected endpoint, with credentials resolved from its own environment variable. */
export function createCompatibleProvider(options: CompatibleProviderOptions): Provider {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(options.id))
    throw new AiError("AI_INVALID_CONFIG");
  let url: URL;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new AiError("AI_INVALID_CONFIG");
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    (options.apiKeyEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.apiKeyEnv)) ||
    !options.models.length
  )
    throw new AiError("AI_INVALID_CONFIG");
  const baseUrl = url.href.replace(/\/$/, "");
  const ids = new Set<string>();
  const models: Model<CompatibleApi>[] = options.models.map((definition) => {
    const contextWindow = definition.contextWindow ?? 32_768;
    const maxTokens = definition.maxTokens ?? Math.min(4096, contextWindow);
    if (
      !definition.id.trim() ||
      definition.id.length > 200 ||
      ids.has(definition.id) ||
      !Number.isSafeInteger(contextWindow) ||
      contextWindow < 1 ||
      !Number.isSafeInteger(maxTokens) ||
      maxTokens < 1 ||
      maxTokens > contextWindow
    )
      throw new AiError("AI_INVALID_CONFIG");
    ids.add(definition.id);
    return {
      id: definition.id,
      name: definition.name ?? definition.id,
      provider: options.id,
      api: options.api,
      baseUrl,
      reasoning: definition.reasoning ?? false,
      input: definition.vision ? ["text", "image"] : ["text"],
      // A custom endpoint has no known catalog pricing. These are not billing estimates.
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow,
      maxTokens,
      ...(options.api === "openai-completions"
        ? { compat: { supportsDeveloperRole: false, supportsReasoningEffort: false } }
        : {}),
    };
  });
  const apis: Record<CompatibleApi, () => ProviderStreams> = {
    "anthropic-messages": anthropicMessagesApi,
    "openai-completions": openAICompletionsApi,
    "openai-responses": openAIResponsesApi,
  };
  if (!Object.hasOwn(apis, options.api)) throw new AiError("AI_INVALID_CONFIG");
  return createProvider({
    id: options.id,
    name: options.name ?? options.id,
    baseUrl,
    models,
    api: apis[options.api](),
    auth: {
      apiKey: options.apiKeyEnv
        ? envApiKeyAuth(options.name ?? options.id, [options.apiKeyEnv])
        : {
            name: options.name ?? options.id,
            resolve: async () => ({
              auth: {
                // SDK clients require a nonempty key even for a keyless local server.
                // Suppress both generated credential headers instead of borrowing ambient keys.
                apiKey: "unused",
                headers: { Authorization: null, "x-api-key": null },
              },
            }),
          },
    },
  });
}
