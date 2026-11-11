import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  createAiClient,
  createCompatibleProvider,
  defaultProviders,
  type AiRequestOptions,
} from "@raypx/ai";
import { mergeAiSettings } from "@raypx/ai/config";
import { modelSelectionSchema, type ModelSelection } from "@raypx/core/tasks";
import type { LocalDatabase } from "../sqlite/index.js";
import { agentMeta } from "../sqlite/schema.js";
import { LocalError } from "../errors.js";
import { loadAiSettings } from "./settings.js";

const defaultKey = "pi-model-default:v1";
export class PiModels {
  constructor(private readonly db: LocalDatabase) {}
  default() {
    const row = this.db.select().from(agentMeta).where(eq(agentMeta.id, defaultKey)).get();
    if (!row || row.value === "null") return null;
    try {
      return modelSelectionSchema.parse(JSON.parse(row.value));
    } catch {
      throw new LocalError("AI_INVALID_CONFIG", "Saved model default is invalid.");
    }
  }
  private async snapshot() {
    const settings = loadAiSettings();
    const providers = defaultProviders();
    if (settings.base_url) {
      if (!settings.provider || !settings.model || !settings.api)
        throw new LocalError(
          "AI_INVALID_CONFIG",
          "Custom endpoint requires provider, model and API.",
        );
      const custom = createCompatibleProvider({
        id: settings.provider,
        baseUrl: settings.base_url,
        api: settings.api,
        ...(settings.api_key_env ? { apiKeyEnv: settings.api_key_env } : {}),
        models: [
          {
            id: settings.model,
            ...(settings.context_window ? { contextWindow: settings.context_window } : {}),
            ...(settings.max_tokens ? { maxTokens: settings.max_tokens } : {}),
          },
        ],
      });
      const index = providers.findIndex((provider) => provider.id === custom.id);
      if (index < 0) providers.push(custom);
      else providers[index] = custom;
    }
    const client = createAiClient({ providers });
    try {
      const readiness = new Map(
        await Promise.all(
          providers.map(
            async (provider) =>
              [
                provider.id,
                provider.id === settings.provider && settings.api_key_env
                  ? Boolean(process.env[settings.api_key_env])
                  : settings.base_url && provider.id === settings.provider
                    ? settings.auth !== "bearer"
                    : await client.authStatus(provider.id),
              ] as const,
          ),
        ),
      );
      const entries = client.models().map((metadata) => {
        const model = client.resolveModel({ provider: metadata.provider, model: metadata.id });
        const configured = model.provider === settings.provider;
        const connectionId = createHash("sha256")
          .update(
            JSON.stringify([
              model.provider,
              model.api,
              model.baseUrl,
              configured ? (settings.auth ?? "api_key") : "builtin",
              configured
                ? (settings.api_key_env ?? (settings.base_url ? "keyless" : "provider-env"))
                : "provider-env",
            ]),
          )
          .digest("hex");
        return {
          ...metadata,
          selection: { provider: model.provider, model: model.id, connectionId },
          configured: readiness.get(model.provider) ?? false,
          origin: new URL(model.baseUrl).origin,
        };
      });
      return { client, entries, settings };
    } catch (error) {
      client.close();
      throw error;
    }
  }
  async list() {
    const snapshot = await this.snapshot();
    try {
      const configuredDefault =
        this.default() ??
        (snapshot.settings.provider && snapshot.settings.model
          ? snapshot.entries.find(
              (entry) =>
                entry.provider === snapshot.settings.provider &&
                entry.id === snapshot.settings.model,
            )?.selection
          : null);
      if (!configuredDefault && (snapshot.settings.provider || snapshot.settings.model))
        throw new LocalError("AI_INVALID_CONFIG", "Default model is unavailable.");
      return { models: snapshot.entries, default: configuredDefault ?? null };
    } finally {
      snapshot.client.close();
    }
  }
  async setDefault(selection: ModelSelection | null) {
    if (selection) {
      const resolved = await this.resolve(selection);
      resolved.close();
    }
    this.db
      .insert(agentMeta)
      .values({ id: defaultKey, value: JSON.stringify(selection) })
      .onConflictDoUpdate({ target: agentMeta.id, set: { value: JSON.stringify(selection) } })
      .run();
    return { default: selection };
  }
  async resolve(selection?: ModelSelection) {
    const snapshot = await this.snapshot();
    try {
      const selected =
        selection ??
        this.default() ??
        snapshot.entries.find(
          (entry) =>
            entry.provider === snapshot.settings.provider && entry.id === snapshot.settings.model,
        )?.selection;
      if (!selected) throw new LocalError("AI_NOT_CONFIGURED", "Choose a Pi model.");
      const entry = snapshot.entries.find(
        (candidate) =>
          candidate.selection.connectionId === selected.connectionId &&
          candidate.provider === selected.provider &&
          candidate.id === selected.model,
      );
      if (!entry)
        throw new LocalError("AI_MODEL_NOT_FOUND", "Model or connection configuration changed.");
      if (!entry.configured)
        throw new LocalError(
          "AI_AUTH_REQUIRED",
          "Configure model credentials in the host environment.",
        );
      const settings = mergeAiSettings(snapshot.settings, {
        provider: selected.provider,
        model: selected.model,
      });
      const apiKey = settings.api_key_env ? process.env[settings.api_key_env] : undefined;
      if (settings.api_key_env && !apiKey)
        throw new LocalError("AI_AUTH_REQUIRED", "Model credentials are unavailable.");
      if (settings.auth === "bearer" && !apiKey)
        throw new LocalError(
          "AI_INVALID_CONFIG",
          "Bearer authentication requires an explicit key environment variable.",
        );
      const request: AiRequestOptions = {
        ...(apiKey ? { apiKey } : {}),
        ...(settings.auth === "bearer"
          ? { headers: { Authorization: `Bearer ${apiKey}`, "x-api-key": null } }
          : {}),
        ...(settings.max_tokens ? { maxTokens: settings.max_tokens } : {}),
        ...(settings.timeout_ms ? { timeoutMs: settings.timeout_ms } : {}),
        ...(settings.temperature === undefined ? {} : { temperature: settings.temperature }),
      };
      return {
        selection: entry.selection,
        model: snapshot.client.resolveModel(selected),
        stream: (
          _model: unknown,
          context: Parameters<typeof snapshot.client.stream>[1],
          options?: { signal?: AbortSignal },
        ) =>
          snapshot.client.stream(selected, context, {
            ...request,
            ...(options?.signal ? { signal: options.signal } : {}),
          }),
        close: () => snapshot.client.close(),
      };
    } catch (error) {
      snapshot.client.close();
      throw error;
    }
  }
}
