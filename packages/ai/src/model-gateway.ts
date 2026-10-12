import { InMemoryCredentialStore, type Context } from "@earendil-works/pi-ai";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { normalizeModelUsage, type ModelCallHooks } from "./cloud-pi.js";

export interface ModelGatewayRequest {
  callId: string;
  context: unknown;
  maxOutputTokens: number;
}
export type ModelGatewayTransport = (
  request: ModelGatewayRequest,
  signal: AbortSignal,
) => Promise<AsyncIterable<unknown>>;

/** The provider request, credentials and metering belong to the trusted host. */
export async function createModelGateway(options: {
  model: { provider: string; id: string };
  apiKey: string;
}) {
  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  await runtime.setRuntimeApiKey(options.model.provider, options.apiKey);
  const model = runtime.getPhysicalModel(options.model.provider, options.model.id);
  if (!model || !(await runtime.getAuth(model))) throw new Error("MODEL_UNAVAILABLE");
  return {
    async stream(request: ModelGatewayRequest, hooks: ModelCallHooks, signal: AbortSignal) {
      const serialized = JSON.stringify(request.context);
      if (!serialized || serialized.length > 96_000) throw new Error("MODEL_INPUT_LIMIT");
      const context = request.context as Context;
      if (!context || !Array.isArray(context.messages) || context.messages.length > 1000)
        throw new Error("MODEL_CONTEXT_INVALID");
      const allowed = new Set([
        "search",
        "read_source",
        "extract_file",
        "compute_table",
        "render_report",
        "render_table",
        "render_deck",
        "delegate",
      ]);
      if (context.tools?.some((tool) => !allowed.has(tool.name)))
        throw new Error("MODEL_TOOL_FORBIDDEN");
      signal.throwIfAborted();
      await hooks.reserve({
        callId: request.callId,
        provider: model.provider,
        model: model.id,
        maxTokens: Math.ceil(serialized.length / 4) + request.maxOutputTokens,
        pricing: {
          inputPerMillion: model.cost.input,
          outputPerMillion: model.cost.output,
          cacheReadPerMillion: model.cost.cacheRead,
          cacheWritePerMillion: model.cost.cacheWrite,
        },
      });
      let started = false;
      try {
        signal.throwIfAborted();
        await hooks.start(request.callId);
        started = true;
        const stream = runtime.streamSimple(model, context, {
          maxTokens: Math.min(model.maxTokens, request.maxOutputTokens),
          maxRetries: 0,
          signal,
        });
        // Settlement continues even if the HTTP subscriber or execution owner disappears.
        const settled = stream.result().then(
          (message) =>
            hooks.settle({
              callId: request.callId,
              usage: normalizeModelUsage(
                message.stopReason === "error" || message.stopReason === "aborted"
                  ? null
                  : message.usage,
              ),
              started: true,
            }),
          () =>
            hooks.settle({
              callId: request.callId,
              usage: normalizeModelUsage(null),
              started: true,
            }),
        );
        void settled.catch(() => undefined);
        return { events: stream as AsyncIterable<unknown>, settled };
      } catch (error) {
        await hooks.settle({ callId: request.callId, usage: normalizeModelUsage(null), started });
        throw error;
      }
    },
  };
}
