import { join } from "node:path";
import { lazyStream, type AssistantMessageEvent } from "@earendil-works/pi-ai";
import type { ModelGatewayTransport } from "./model-gateway.js";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AiRunEvent } from "./index.js";
import { normalizePiEvent, settledResult, type AssistantResult } from "./pi-events.js";

export interface ModelUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
}
export interface ModelCallHooks {
  reserve(input: {
    callId: string;
    provider: string;
    model: string;
    maxTokens: number;
    pricing: {
      inputPerMillion: number;
      outputPerMillion: number;
      cacheReadPerMillion?: number;
      cacheWritePerMillion?: number;
    } | null;
  }): Promise<void>;
  start(callId: string): Promise<void>;
  settle(input: { callId: string; usage: ModelUsage; started: boolean }): Promise<void>;
}
export interface TrustedAiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(
    input: unknown,
    context: { callId: string; signal: AbortSignal | undefined },
  ): Promise<unknown>;
}
export interface CloudPiOptions {
  model: { provider: string; id: string };
  apiKey?: string;
  transport?: ModelGatewayTransport;
}
export interface CloudPiRunInput {
  cwd: string;
  prompt: string;
  systemPrompt: string;
  tools: readonly TrustedAiTool[];
  hooks: ModelCallHooks;
  maxOutputTokens: number;
  onEvent: (event: AiRunEvent) => Promise<void>;
  signal: AbortSignal;
  onReady?: (controls: { steer(prompt: string): Promise<void> }) => void;
}
export interface CloudPiAgent {
  run(input: CloudPiRunInput): Promise<AiRunEvent>;
}
export class CloudModelUnavailableError extends Error {
  readonly code = "MODEL_UNAVAILABLE";
  constructor() {
    super("Cloud model is unavailable: provider, model or credentials are missing.");
    this.name = "CloudModelUnavailableError";
  }
}
export async function checkPiRuntime(): Promise<void> {
  const sdk = await import("@earendil-works/pi-coding-agent");
  if (typeof sdk.createAgentSession !== "function")
    throw new Error("Pi SDK runtime is unavailable.");
}

const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export function normalizeModelUsage(value: unknown): ModelUsage {
  const usage =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    inputTokens: numeric(usage.input),
    outputTokens: numeric(usage.output),
    cacheReadTokens: numeric(usage.cacheRead),
    cacheWriteTokens: numeric(usage.cacheWrite),
  };
}

/** A fresh isolated session; all physical model attempts pass the same host hooks. */
export function createCloudPiAgent(options: CloudPiOptions): CloudPiAgent {
  return {
    async run(input) {
      if (input.signal.aborted) return { type: "cancelled" };
      if (!options.model.provider || !options.model.id) throw new CloudModelUnavailableError();
      const sdk = await import("@earendil-works/pi-coding-agent");
      const agentDir = join(input.cwd, ".pi");
      const runtime = await sdk.ModelRuntime.create({
        allowModelNetwork: false,
        refreshOnCreate: false,
        modelsPath: null,
        authPath: join(agentDir, "auth.json"),
      });
      if (options.transport || options.apiKey)
        await runtime.setRuntimeApiKey(
          options.model.provider,
          options.transport ? "gateway" : options.apiKey!,
        );
      const model = runtime.getPhysicalModel(options.model.provider, options.model.id);
      if (!model || !(await runtime.getAuth(model))) throw new CloudModelUnavailableError();
      const settingsManager = sdk.SettingsManager.inMemory({
        cacheWarming: "off",
        retry: { enabled: !options.transport, maxRetries: 2, provider: { maxRetries: 0 } },
        compaction: { enabled: true },
        packages: [],
        extensions: [],
        skills: [],
        prompts: [],
        enableAnalytics: false,
        enableInstallTelemetry: false,
      });
      const resourceLoader = new sdk.DefaultResourceLoader({
        cwd: input.cwd,
        agentDir,
        settingsManager,
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
        systemPrompt: input.systemPrompt,
      });
      await resourceLoader.reload();
      const customTools = input.tools.map((tool): ToolDefinition => ({
        name: tool.name,
        label: tool.name,
        description: tool.description,
        parameters: tool.parameters as ToolDefinition["parameters"],
        executionMode: "sequential",
        async execute(callId, args, signal) {
          signal?.throwIfAborted();
          const output = await tool.execute(args, { callId, signal });
          return {
            content: [
              { type: "text", text: typeof output === "string" ? output : JSON.stringify(output) },
            ],
            details: output,
          };
        },
      }));
      const { session } = await sdk.createAgentSession({
        cwd: input.cwd,
        agentDir,
        modelRuntime: runtime,
        model,
        settingsManager,
        resourceLoader,
        sessionManager: sdk.SessionManager.inMemory(),
        noTools: "builtin",
        tools: input.tools.map((tool) => tool.name),
        customTools,
      });
      const stream = session.agent.streamFunction;
      const settlements: Promise<void>[] = [];
      session.agent.streamFunction = async (requestModel, context, requestOptions) => {
        input.signal.throwIfAborted();
        const callId = crypto.randomUUID();
        const maxTokens = Math.min(input.maxOutputTokens, requestModel.maxTokens);
        if (options.transport) {
          return lazyStream(requestModel, async () => {
            const events = await options.transport!(
              { callId, context, maxOutputTokens: maxTokens },
              input.signal,
            );
            return events as AsyncIterable<AssistantMessageEvent>;
          });
        }
        const pricing = requestModel.cost
          ? {
              inputPerMillion: requestModel.cost.input,
              outputPerMillion: requestModel.cost.output,
              cacheReadPerMillion: requestModel.cost.cacheRead,
              cacheWritePerMillion: requestModel.cost.cacheWrite,
            }
          : null;
        await input.hooks.reserve({
          callId,
          provider: requestModel.provider,
          model: requestModel.id,
          maxTokens,
          pricing,
        });
        let started = false;
        try {
          input.signal.throwIfAborted();
          await input.hooks.start(callId);
          started = true;
          const result = await stream(requestModel, context, {
            ...requestOptions,
            maxTokens,
            maxRetries: 0,
          });
          const settled = result.result().then(
            (message) =>
              input.hooks.settle({
                callId,
                usage: normalizeModelUsage(message.usage),
                started: true,
              }),
            () => input.hooks.settle({ callId, usage: normalizeModelUsage(null), started: true }),
          );
          settlements.push(settled);
          // Register rejection immediately; the host still awaits and surfaces it below.
          void settled.catch(() => session.abort());
          return result;
        } catch (error) {
          await input.hooks.settle({ callId, usage: normalizeModelUsage(null), started });
          throw error;
        }
      };
      let assistant: AssistantResult | undefined;
      let eventFailure: unknown;
      let delivery = Promise.resolve();
      const unsubscribe = session.subscribe((event) => {
        const mapped = normalizePiEvent(event);
        if (mapped?.type === "message_completed") assistant = mapped;
        if (mapped)
          delivery = delivery
            .then(() => input.onEvent(mapped))
            .catch((error: unknown) => {
              eventFailure = error;
              return session.abort();
            });
      });
      const abort = () => {
        void session.abort();
      };
      input.signal.addEventListener("abort", abort, { once: true });
      input.onReady?.({
        steer: async (prompt) => {
          await session.steer(prompt);
        },
      });
      try {
        let promptError: unknown;
        let promptFailed = false;
        try {
          input.signal.throwIfAborted();
          await session.prompt(input.prompt);
        } catch (error) {
          promptFailed = true;
          promptError = error;
        }
        await delivery;
        await Promise.all(settlements);
        if (eventFailure) throw eventFailure;
        if (promptFailed) throw promptError;
        return input.signal.aborted ? { type: "cancelled" } : settledResult(assistant);
      } finally {
        input.signal.removeEventListener("abort", abort);
        unsubscribe();
        session.dispose();
      }
    },
  };
}
