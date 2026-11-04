import { loadAiSettings } from "../runtime/ai/settings";
import { InstanceRuntime, type InstanceAccess } from "../runtime/instances";
import { profilePath } from "../runtime/state";
import { ProfileStorage } from "../runtime/sqlite";
import { instanceKeys } from "../runtime/instances/keys";
import { defineCommand, type CommandDef } from "citty";
import { mergeAiSettings, parseAiSettings } from "@raypx/ai/config";
import type { AiRequestOptions } from "@raypx/ai";
import { LocalError } from "../runtime/errors";
import { globalArgs, type CliArgs } from "./args";

function input(source: string | undefined): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(source ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new LocalError("INVALID_INPUT", "AI commands accept one JSON object.");
  }
}

function defineAiCommand(definition: CommandDef) {
  return defineCommand(definition);
}

export function createAiCommands(
  invocation: CliArgs,
  options: { dataDir?: string; profile?: string; instanceAccess?: InstanceAccess } = {},
) {
  const leaves = new Map<string, CommandDef>();
  for (const [action, description] of Object.entries({
    providers: "List built-in AI providers without resolving credentials",
    models: "List AI models from the local catalog",
    complete: "Run one model request from JSON prompt and optional model settings",
  })) {
    leaves.set(
      action,
      defineAiCommand({
        meta: { name: `ai ${action}`, description },
        args: {
          ...globalArgs,
          input: {
            type: "positional",
            description: 'JSON params, e.g. {"prompt":"Hello"}',
            required: action === "complete",
          },
        },
        async run({ args }) {
          if (args._.length > 1)
            throw new LocalError("INVALID_INPUT", "Expected at most one JSON input.");
          // Catalog reads stay offline and never open a profile.
          let storage: ProfileStorage | undefined;
          try {
            if (action === "complete") {
              const access =
                options.instanceAccess ??
                new InstanceRuntime(profilePath(options), {
                  keys: instanceKeys((storage = new ProfileStorage(profilePath(options))).database),
                });
              await access.assert();
            }
            await runAiCommand(action, input(args._[0]), invocation);
          } finally {
            storage?.close();
          }
        },
      }),
    );
  }
  return {
    leaves,
    command: defineAiCommand({
      meta: { name: "ai", description: "Pi AI model calls using user-level settings" },
      args: globalArgs,
      subCommands: Object.fromEntries(leaves),
    }),
  };
}

async function runAiCommand(action: string, value: Record<string, unknown>, invocation: CliArgs) {
  const { createAiClient, createCompatibleProvider, AiError } = await import("@raypx/ai");
  let client: ReturnType<typeof createAiClient> | undefined;
  const controller = new AbortController();
  const interrupt = () => {
    process.exitCode = 130;
    controller.abort();
  };
  const terminate = () => {
    process.exitCode = 143;
    controller.abort();
  };
  try {
    const { prompt, system, ...configuration } = value;
    if (action !== "complete" && (prompt !== undefined || system !== undefined))
      throw new LocalError("INVALID_INPUT", "Only ai complete accepts prompt and system.");
    if (action === "providers" && Object.keys(value).length)
      throw new LocalError("INVALID_INPUT", "ai providers does not accept settings.");
    if (action === "models" && Object.keys(configuration).some((key) => key !== "provider"))
      throw new LocalError("INVALID_INPUT", "ai models only accepts a provider filter.");
    const override = parseAiSettings(configuration);
    const settings = action === "complete" ? mergeAiSettings(loadAiSettings(), override) : override;
    const custom = settings.base_url !== undefined;
    if (custom && (!settings.provider || !settings.model || !settings.api))
      throw new AiError("AI_INVALID_CONFIG");
    client = createAiClient(
      custom
        ? {
            providers: [
              createCompatibleProvider({
                id: settings.provider!,
                baseUrl: settings.base_url!,
                api: settings.api!,
                ...(settings.api_key_env ? { apiKeyEnv: settings.api_key_env } : {}),
                models: [
                  {
                    id: settings.model!,
                    ...(settings.context_window ? { contextWindow: settings.context_window } : {}),
                    ...(settings.max_tokens ? { maxTokens: settings.max_tokens } : {}),
                  },
                ],
              }),
            ],
          }
        : {},
    );
    if (action === "providers") {
      if (Object.keys(value).length)
        throw new LocalError("INVALID_INPUT", "ai providers does not accept settings.");
      console.log(JSON.stringify(client.providers(), null, invocation.json ? undefined : 2));
      return;
    }
    if (action === "models") {
      console.log(
        JSON.stringify(client.models(settings.provider), null, invocation.json ? undefined : 2),
      );
      return;
    }
    if (
      typeof prompt !== "string" ||
      !prompt.trim() ||
      prompt.length > 128_000 ||
      (system !== undefined && (typeof system !== "string" || system.length > 32_000))
    )
      throw new LocalError("INVALID_INPUT", "Provide a nonempty prompt and optional system text.");
    if (!settings.provider || !settings.model)
      throw new LocalError(
        "AI_NOT_CONFIGURED",
        "Set ai.provider and ai.model in ~/.raypx/config.toml or JSON params.",
      );
    const apiKey = settings.api_key_env ? process.env[settings.api_key_env] : undefined;
    if (settings.api_key_env && !apiKey) throw new AiError("AI_AUTH_REQUIRED");
    if (settings.auth === "bearer" && !apiKey) throw new AiError("AI_INVALID_CONFIG");
    const options: AiRequestOptions = {
      signal: controller.signal,
      ...(apiKey ? { apiKey } : {}),
      ...(settings.auth === "bearer"
        ? { headers: { Authorization: `Bearer ${apiKey}`, "x-api-key": null } }
        : {}),
      ...(settings.max_tokens ? { maxTokens: settings.max_tokens } : {}),
      ...(settings.timeout_ms ? { timeoutMs: settings.timeout_ms } : {}),
      ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const result = await client.complete(
      { provider: settings.provider, model: settings.model },
      {
        ...(typeof system === "string" ? { systemPrompt: system } : {}),
        messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
      },
      options,
    );
    console.log(JSON.stringify(result, null, invocation.json ? undefined : 2));
  } catch (error) {
    // Signals already select 130/143; returning lets the top-level command preserve them.
    if (controller.signal.aborted) return;
    if (error instanceof LocalError) throw error;
    if (error instanceof AiError) throw new LocalError(error.code, error.message);
    throw new LocalError("AI_REQUEST_FAILED", "The AI request failed.");
  } finally {
    client?.close();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}
