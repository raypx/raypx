import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
  type Api,
} from "@raypx/ai";

type PiFailureCode =
  | "PI_BUSY"
  | "PI_INVALID_INPUT"
  | "PI_RECOVERY_REQUIRED"
  | "PI_PERSISTENCE_FAILED"
  | "PI_MODEL_FAILED"
  | "PI_MODEL_INCOMPLETE"
  | "PI_TOOL_DENIED"
  | "PI_TOOL_FAILED"
  | "PI_DUPLICATE_TOOL_CALL"
  | "PI_TIMEOUT"
  | "PI_LIMIT_REACHED";
type PiStatus = "idle" | "running" | "succeeded" | "failed" | "cancelled" | "uncertain";
export interface PiContext {
  revision: number;
  status: PiStatus;
  messages: Message[];
  /** A committed intent with no committed outcome must never be replayed. */
  pendingEffect?: { id: string; name: string };
}
export interface PiContextStore {
  load(): Promise<PiContext>;
  /** Atomic compare-and-swap; return the new revision, or reject without claiming success. */
  commit(expectedRevision: number, context: Omit<PiContext, "revision">): Promise<number>;
}
export interface PiResult {
  status: "succeeded" | "failed" | "cancelled";
  text: string;
  code?: PiFailureCode;
}
export interface PiRunnerOptions {
  model: Model<Api>;
  stream: StreamFn;
  tools: AgentTool[];
  authorize(
    call: { id: string; name: string; arguments: unknown },
    signal: AbortSignal,
  ): Promise<"allow" | "deny">;
  store: PiContextStore;
  maxRequests?: number;
}
export interface PiRunOptions {
  signal?: AbortSignal;
  /** Abort the run after this deadline, then wait for active work and persistence to settle. */
  timeoutMs?: number;
}

function safeMessage(message: Message): Message {
  if (message.role === "toolResult" && message.isError)
    return {
      ...structuredClone(message),
      content: [{ type: "text", text: "PI_TOOL_FAILED" }],
      details: {},
    };
  if (message.role !== "assistant") return structuredClone(message);
  return safeAssistant(message);
}
function safeAssistant(message: AssistantMessage): AssistantMessage {
  const { errorMessage: _error, diagnostics: _diagnostics, ...safe } = message;
  return structuredClone(
    message.stopReason === "error" || message.stopReason === "aborted"
      ? { ...safe, content: [], errorMessage: "PI_MODEL_FAILED" }
      : safe,
  );
}
function failedMessage(model: Model<Api>, aborted: boolean): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: model.api,
    provider: model.provider,
    model: model.id,
    stopReason: aborted ? "aborted" : "error",
    errorMessage: "PI_MODEL_FAILED",
    timestamp: Date.now(),
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

/** Experimental, caller-owned SDK loop. It is not a product provider or a task executor. */
export class PiRunner {
  private pending: Promise<PiResult> | undefined;
  private controller: AbortController | undefined;
  private agent: Agent | undefined;
  constructor(private readonly options: PiRunnerOptions) {}

  run(prompt: string, options: PiRunOptions = {}): Promise<PiResult> {
    if (this.pending) return Promise.resolve({ status: "failed", text: "", code: "PI_BUSY" });
    const timeoutMs = options.timeoutMs ?? 60_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000)
      return Promise.resolve({ status: "failed", text: "", code: "PI_INVALID_INPUT" });
    const controller = new AbortController();
    this.controller = controller;
    const signal = options.signal
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    let timedOut = false;
    const timer = setTimeout(() => {
      if (signal.aborted) return;
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abort = () => this.agent?.abort();
    signal.addEventListener("abort", abort, { once: true });
    const pending = this.execute(prompt, signal, () => timedOut).finally(() => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      this.agent = undefined;
      this.controller = undefined;
      this.pending = undefined;
    });
    this.pending = pending;
    return pending;
  }

  /** Cancellation settles only after model/tools/listeners and the terminal commit finish. */
  async cancel(): Promise<void> {
    this.controller?.abort();
    this.agent?.abort();
    await this.pending;
  }

  private async execute(
    prompt: string,
    signal: AbortSignal,
    timedOut: () => boolean,
  ): Promise<PiResult> {
    let checkpoint: PiContext;
    let failure: PiFailureCode | undefined;
    let requests = 0;
    const abortedResult = (): PiResult =>
      timedOut()
        ? { status: "failed", text: "", code: "PI_TIMEOUT" }
        : { status: "cancelled", text: "" };
    const maxRequests = this.options.maxRequests ?? 8;
    if (
      !prompt.trim() ||
      prompt.length > 32_000 ||
      !Number.isInteger(maxRequests) ||
      maxRequests < 1 ||
      maxRequests > 32
    )
      return { status: "failed", text: "", code: "PI_INVALID_INPUT" };
    const stop = (code: PiFailureCode) => {
      failure ??= code;
      this.agent?.abort();
      return new Error(code);
    };
    const write = async (next: Omit<PiContext, "revision">) => {
      if (failure === "PI_PERSISTENCE_FAILED") throw new Error(failure);
      try {
        const record: Omit<PiContext, "revision"> = {
          status: next.status,
          messages: next.messages,
          ...(next.pendingEffect ? { pendingEffect: next.pendingEffect } : {}),
        };
        const revision = await this.options.store.commit(
          checkpoint.revision,
          structuredClone(record),
        );
        if (revision !== checkpoint.revision + 1) throw new Error("Invalid revision");
        checkpoint = { ...record, revision };
      } catch {
        failure = "PI_PERSISTENCE_FAILED";
        throw stop(failure);
      }
    };
    try {
      try {
        checkpoint = structuredClone(await this.options.store.load());
      } catch {
        throw stop("PI_PERSISTENCE_FAILED");
      }
      if (
        checkpoint.status === "running" ||
        checkpoint.status === "uncertain" ||
        checkpoint.pendingEffect
      )
        return { status: "failed", text: "", code: "PI_RECOVERY_REQUIRED" };
      if (signal.aborted) return abortedResult();
      await write({ status: "running", messages: checkpoint.messages });
      const tools = this.options.tools.map((tool): AgentTool => ({
        ...tool,
        replay: "never",
        executionMode: "sequential",
        execute: async (id, args, activeSignal) => {
          if (
            failure ||
            signal.aborted ||
            activeSignal?.aborted ||
            checkpoint.pendingEffect?.id !== id
          )
            throw stop(failure ?? "PI_TOOL_DENIED");
          try {
            // The durable authorized intent already exists before any caller effect starts.
            const result = await tool.execute(id, args, activeSignal);
            if (result.isError) throw new Error("Tool failed");
            return result;
          } catch {
            throw stop("PI_TOOL_FAILED");
          }
        },
      }));
      const stream: StreamFn = (model, context, request) => {
        const output = createAssistantMessageEventStream();
        void (async () => {
          const publish = (message: AssistantMessage) => {
            if (["pending", "length", "deferred"].includes(message.stopReason))
              failure ??= "PI_MODEL_INCOMPLETE";
            const safe =
              message.stopReason === "pending"
                ? failedMessage(model, false)
                : safeAssistant(message);
            if (safe.stopReason === "pending")
              output.push({ type: "error", reason: "error", error: failedMessage(model, false) });
            else if (safe.stopReason === "error" || safe.stopReason === "aborted")
              output.push({ type: "error", reason: safe.stopReason, error: safe });
            else output.push({ type: "done", reason: safe.stopReason, message: safe });
          };
          try {
            if (failure || signal.aborted || request?.signal?.aborted) {
              publish(failedMessage(model, true));
              return;
            }
            const upstream = await this.options.stream(model, context, {
              ...request,
              maxRetries: 0,
              transport: "sse",
            });
            let finalMessage: AssistantMessage | undefined;
            // SDK end(final) settles result before ending iteration. end() alone
            // only ends iteration, so waiting for its result would never settle.
            void upstream.result().then(
              (message) => {
                finalMessage = message;
              },
              () => {},
            );
            for await (const event of upstream) {
              if (event.type === "done" || event.type === "error") {
                publish(await upstream.result());
                return;
              }
              output.push(event);
            }
            if (finalMessage) publish(finalMessage);
            else {
              const aborted = Boolean(signal.aborted || request?.signal?.aborted);
              if (!aborted) failure ??= "PI_MODEL_INCOMPLETE";
              publish(failedMessage(model, aborted));
            }
          } catch {
            publish(failedMessage(model, Boolean(signal.aborted || request?.signal?.aborted)));
          }
        })();
        return output;
      };
      const agent = new Agent({
        initialState: { model: this.options.model, messages: checkpoint.messages, tools },
        streamFn: stream,
        toolExecution: "sequential",
        transport: "sse",
        prepareRequest: async () => {
          if (failure) throw stop(failure);
          if (signal.aborted) throw new Error("PI_CANCELLED");
          if (++requests > maxRequests) throw stop("PI_LIMIT_REACHED");
          let authoritative: PiContext;
          try {
            authoritative = await this.options.store.load();
          } catch {
            throw stop("PI_PERSISTENCE_FAILED");
          }
          if (
            authoritative.revision !== checkpoint.revision ||
            authoritative.pendingEffect ||
            authoritative.status !== "running"
          )
            throw stop("PI_RECOVERY_REQUIRED");
          return { context: { messages: structuredClone(authoritative.messages), tools } };
        },
        beforeToolCall: async ({ toolCall, args }, activeSignal) => {
          if (failure || signal.aborted || activeSignal?.aborted)
            return { block: true, terminate: true, reason: failure ?? "PI_TOOL_DENIED" };
          if (
            checkpoint.messages.some(
              (message) => message.role === "toolResult" && message.toolCallId === toolCall.id,
            )
          ) {
            failure = "PI_DUPLICATE_TOOL_CALL";
            return { block: true, terminate: true, reason: failure };
          }
          let decision: "allow" | "deny" = "deny";
          try {
            decision = await this.options.authorize(
              { id: toolCall.id, name: toolCall.name, arguments: structuredClone(args) },
              activeSignal ?? signal,
            );
          } catch {
            /* An unavailable approval is never authorization. */
          }
          if (decision !== "allow" || signal.aborted || activeSignal?.aborted) {
            failure ??= "PI_TOOL_DENIED";
            return { block: true, terminate: true, reason: "PI_TOOL_DENIED" };
          }
          await write({ ...checkpoint, pendingEffect: { id: toolCall.id, name: toolCall.name } });
          return undefined;
        },
      });
      this.agent = agent;
      agent.subscribe(async (event) => {
        if (event.type === "tool_execution_end" && event.isError && !signal.aborted)
          stop(failure ?? "PI_TOOL_FAILED");
        if (failure === "PI_PERSISTENCE_FAILED" || event.type !== "message_end") return;
        const next: Omit<PiContext, "revision"> = {
          status: "running",
          messages: agent.state.messages.map(safeMessage),
          ...(checkpoint.pendingEffect ? { pendingEffect: checkpoint.pendingEffect } : {}),
        };
        if (
          event.message.role === "toolResult" &&
          !failure &&
          checkpoint.pendingEffect?.id === event.message.toolCallId
        )
          delete next.pendingEffect;
        await write(next);
      });
      if (signal.aborted) {
        const result = abortedResult();
        await write({ ...checkpoint, status: result.status });
        return result;
      }
      await agent.prompt(prompt.trim());
      await agent.waitForIdle();
      const last = [...checkpoint.messages]
        .reverse()
        .find((message) => message.role === "assistant");
      if (!signal.aborted && !failure && (!last || last.stopReason !== "stop"))
        failure =
          last?.stopReason === "error" || last?.stopReason === "aborted"
            ? "PI_MODEL_FAILED"
            : "PI_MODEL_INCOMPLETE";
      if (timedOut() && failure !== "PI_PERSISTENCE_FAILED") failure = "PI_TIMEOUT";
      const status = timedOut()
        ? "failed"
        : signal.aborted
          ? "cancelled"
          : failure
            ? "failed"
            : "succeeded";
      if (failure !== "PI_PERSISTENCE_FAILED")
        await write({ ...checkpoint, status: checkpoint.pendingEffect ? "uncertain" : status });
      return {
        status: failure === "PI_PERSISTENCE_FAILED" ? "failed" : status,
        text:
          status === "succeeded" && last
            ? last.content
                .filter((part) => part.type === "text")
                .map((part) => part.text)
                .join("\n\n")
            : "",
        ...(failure ? { code: failure } : {}),
      };
    } catch {
      if (signal.aborted && failure !== "PI_PERSISTENCE_FAILED") return abortedResult();
      return {
        status: "failed",
        text: "",
        code: failure ?? "PI_PERSISTENCE_FAILED",
      };
    }
  }
}
