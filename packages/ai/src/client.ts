import {
  createModels,
  ModelsError,
  type AssistantMessage,
  type AssistantMessageEvent,
  type Context,
  type CredentialStore,
  type Provider,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { defaultProviders } from "./providers.js";
import { AiError } from "./errors.js";

export interface AiSelection {
  provider: string;
  model: string;
}
export type AiRequestOptions = Pick<
  SimpleStreamOptions,
  "signal" | "apiKey" | "env" | "headers" | "maxTokens" | "temperature" | "reasoning" | "sessionId"
> & { timeoutMs?: number };
export interface AiStream extends AsyncIterable<AssistantMessageEvent> {
  result(): Promise<AssistantMessage>;
}

function sanitized(message: AssistantMessage): AssistantMessage {
  const { diagnostics: _diagnostics, errorMessage: _errorMessage, ...safe } = message;
  return safe;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    void promise.catch(() => {});
    return Promise.reject(new AiError("AI_ABORTED"));
  }
  return new Promise((resolve, reject) => {
    const abort = () => reject(new AiError("AI_ABORTED"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export function createAiClient(
  options: {
    providers?: readonly Provider[];
    credentials?: CredentialStore;
  } = {},
) {
  const models = createModels(options.credentials ? { credentials: options.credentials } : {});
  const ids = new Set<string>();
  for (const provider of options.providers ?? defaultProviders()) {
    if (ids.has(provider.id)) throw new AiError("AI_INVALID_CONFIG");
    ids.add(provider.id);
    models.setProvider(provider);
  }
  let closed = false;
  const active = new Set<AbortController>();
  const stream = (
    selection: AiSelection,
    context: Context,
    request: AiRequestOptions = {},
  ): AiStream => {
    if (closed) throw new AiError("AI_CLOSED");
    const model = models.getModel(selection.provider, selection.model);
    if (!model) throw new AiError("AI_MODEL_NOT_FOUND");
    const timeoutMs = request.timeoutMs ?? 60_000;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 900_000 ||
      (request.maxTokens !== undefined &&
        (!Number.isSafeInteger(request.maxTokens) ||
          request.maxTokens < 1 ||
          request.maxTokens > model.maxTokens)) ||
      (request.temperature !== undefined &&
        (!Number.isFinite(request.temperature) ||
          request.temperature < 0 ||
          request.temperature > 2))
    )
      throw new AiError("AI_INVALID_CONFIG");
    if (request.signal?.aborted) throw new AiError("AI_ABORTED");
    const controller = new AbortController();
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeoutMs);
    timer.unref();
    const signal = AbortSignal.any([
      controller.signal,
      deadline.signal,
      ...(request.signal ? [request.signal] : []),
    ]);
    active.add(controller);
    let status = 0;
    const failure = (error: unknown) => {
      if (deadline.signal.aborted) return new AiError("AI_TIMEOUT");
      if (signal.aborted) return new AiError("AI_ABORTED");
      if (error instanceof AiError) return error;
      const providerMessage =
        error &&
        typeof error === "object" &&
        "errorMessage" in error &&
        typeof error.errorMessage === "string"
          ? error.errorMessage
          : "";
      const match = /^(?:(\d{3})(?:\s|:|$)|[\w -]+ API error \((\d{3})\):)/i.exec(providerMessage);
      const httpStatus = status || Number(match?.[1] ?? match?.[2] ?? 0);
      if (
        httpStatus === 401 ||
        httpStatus === 403 ||
        (error instanceof ModelsError && ["auth", "oauth"].includes(error.code))
      )
        return new AiError("AI_AUTH_REQUIRED");
      if (httpStatus === 429) return new AiError("AI_RATE_LIMITED");
      return new AiError("AI_REQUEST_FAILED");
    };
    const finish = () => {
      clearTimeout(timer);
      active.delete(controller);
    };
    // Resolve auth explicitly so missing credentials have a stable error before dispatch.
    const started = abortable(
      (async () => {
        const auth = await models.getAuth(model, { ...request, signal });
        if (!auth) throw new AiError("AI_AUTH_REQUIRED");
        if (signal.aborted) throw new AiError("AI_ABORTED");
        return models.streamSimple(model, context, {
          ...request,
          signal,
          timeoutMs,
          maxRetries: 0,
          transport: "sse",
          maxTokens: request.maxTokens ?? Math.min(model.maxTokens, 4096),
          onResponse: (response) => {
            status = response.status;
          },
        });
      })(),
      signal,
    );
    const result = started
      .then((upstream) => abortable(upstream.result(), signal))
      .then((message) => {
        if (message.stopReason === "error" || message.stopReason === "aborted")
          throw failure(message);
        return sanitized(message);
      })
      .catch((error: unknown) => {
        throw failure(error);
      })
      .finally(finish);
    // A caller may consume only events; keep the parallel result promise observed.
    void result.catch(() => {});
    return {
      result: () => result,
      async *[Symbol.asyncIterator]() {
        try {
          const upstream = await started;
          const iterator = upstream[Symbol.asyncIterator]();
          for (;;) {
            const item = await abortable(iterator.next(), signal);
            if (item.done) break;
            const event = item.value;
            if (event.type === "error") throw failure(event.error);
            yield event.type === "done"
              ? { ...event, message: sanitized(event.message) }
              : { ...event, partial: sanitized(event.partial) };
          }
        } catch (error) {
          throw failure(error);
        } finally {
          controller.abort();
          finish();
        }
      },
    };
  };
  return {
    providers: () => models.getProviders().map(({ id, name }) => ({ id, name })),
    models: (provider?: string) =>
      models.getModels(provider).map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        api: model.api,
        input: [...model.input],
        reasoning: model.reasoning,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      })),
    stream,
    complete: async (selection: AiSelection, context: Context, request?: AiRequestOptions) =>
      stream(selection, context, request).result(),
    close() {
      closed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}
export type AiClient = ReturnType<typeof createAiClient>;
