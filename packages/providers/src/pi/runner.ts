import type { ConversationEvent } from "../core/index.js";
import { Agent, type AgentTool, type StreamFn } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  prepareModelContext,
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
  | "PI_LIMIT_REACHED"
  | "PI_CONTEXT_TOO_LARGE"
  | "PI_CONTEXT_INCOMPATIBLE";
type PiStatus = "idle" | "running" | "succeeded" | "failed" | "cancelled" | "uncertain";
export interface PiContext {
  revision: number;
  identity?: {
    version: 1;
    binding: string;
    projectId: string;
    ownerTaskId: string;
    model: import("@raypx/core/tasks").ModelSelection;
  };
  status: PiStatus;
  messages: Message[];
  pendingApproval?: {
    requestId: string;
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
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
  stream: (
    ...args: Parameters<StreamFn>
  ) => import("@raypx/ai").AiStream | Promise<import("@raypx/ai").AiStream>;
  tools: AgentTool[];
  authorize(
    call: { id: string; name: string; arguments: unknown; requestId?: string },
    signal: AbortSignal,
  ): Promise<"allow" | "deny">;
  store: PiContextStore;
  maxRequests?: number;
  restoreApproval?: boolean;
  effectful?(name: string): boolean;
  onActivity?(event: ConversationEvent): void;
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

/** Resume only the final outstanding call from the latest assistant message. */
function recoverablePiApproval(context: PiContext, callId: string) {
  const messages = context.messages;
  let assistant = messages.length - 1;
  while (assistant >= 0 && messages[assistant]?.role === "toolResult") assistant--;
  const message = messages[assistant];
  if (message?.role !== "assistant" || message.stopReason !== "toolUse") return false;
  const completed = new Set(
    messages
      .slice(assistant + 1)
      .flatMap((item) => (item.role === "toolResult" ? [item.toolCallId] : [])),
  );
  const outstanding = message.content.filter(
    (part) => part.type === "toolCall" && !completed.has(part.id),
  );
  return (
    outstanding.length === 1 && outstanding[0]?.type === "toolCall" && outstanding[0].id === callId
  );
}

/** Bounded SDK loop. The injected host owns tools, durable context and authorization. */
export class PiRunner {
  private pending: Promise<PiResult> | undefined;
  private controller: AbortController | undefined;
  private agent: Agent | undefined;
  private suspended = false;
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
    let remaining = timeoutMs;
    let started = Date.now();
    const expire = () => {
      if (signal.aborted) return;
      timedOut = true;
      controller.abort();
    };
    let timer = setTimeout(expire, remaining);
    const pause = () => {
      clearTimeout(timer);
      remaining -= Date.now() - started;
    };
    const resume = () => {
      started = Date.now();
      if (!signal.aborted) timer = setTimeout(expire, Math.max(1, remaining));
    };
    const abort = () => this.agent?.abort();
    signal.addEventListener("abort", abort, { once: true });
    const pending = this.execute(prompt, signal, () => timedOut, pause, resume).finally(() => {
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
  async cancel(suspend = false): Promise<void> {
    this.suspended = suspend;
    this.controller?.abort();
    this.agent?.abort();
    await this.pending;
  }

  private async execute(
    prompt: string,
    signal: AbortSignal,
    timedOut: () => boolean,
    pause: () => void,
    resume: () => void,
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
      prompt.length > 34_000 ||
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
          ...(checkpoint.identity ? { identity: checkpoint.identity } : {}),
          messages: next.messages,
          ...(next.pendingApproval ? { pendingApproval: next.pendingApproval } : {}),
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
      const approval = this.options.restoreApproval ? checkpoint.pendingApproval : undefined;
      if (
        (checkpoint.status === "running" && !approval) ||
        checkpoint.status === "uncertain" ||
        checkpoint.pendingEffect
      )
        return { status: "failed", text: "", code: "PI_RECOVERY_REQUIRED" };
      if (signal.aborted) return abortedResult();
      if (approval) {
        const tool = this.options.tools.find(({ name }) => name === approval.name);
        if (!tool || !recoverablePiApproval(checkpoint, approval.id))
          return { status: "failed", text: "", code: "PI_RECOVERY_REQUIRED" };
        let decision: "allow" | "deny" = "deny";
        pause();
        try {
          decision = await this.options.authorize(approval, signal);
        } catch {
          // A lost approval is never authorization.
        } finally {
          resume();
        }
        if (signal.aborted && this.suspended) return abortedResult();
        if (decision !== "allow" || signal.aborted) {
          await write({
            status: signal.aborted ? "cancelled" : "failed",
            messages: checkpoint.messages,
          });
          return signal.aborted
            ? abortedResult()
            : { status: "failed", text: "", code: "PI_TOOL_DENIED" };
        }
        await write({
          status: "running",
          messages: checkpoint.messages,
          pendingEffect: { id: approval.id, name: approval.name },
        });
        this.options.onActivity?.({
          type: "tool",
          id: approval.id,
          name: approval.name,
          status: "running",
        });
        try {
          signal.throwIfAborted();
          const result = await tool.execute(
            approval.id,
            structuredClone(approval.arguments),
            signal,
          );
          if (result.isError) throw new Error("Tool failed");
          await write({
            status: "running",
            messages: [
              ...checkpoint.messages,
              {
                role: "toolResult",
                toolCallId: approval.id,
                toolName: approval.name,
                content: result.content,
                details: result.details,
                isError: false,
                timestamp: Date.now(),
              },
            ],
          });
          this.options.onActivity?.({ type: "tool-result", id: approval.id, failed: false });
        } catch {
          if (!failure) {
            await write({ ...checkpoint, status: "uncertain" });
            this.options.onActivity?.({ type: "tool-result", id: approval.id, failed: true });
          }
          return { status: "failed", text: "", code: failure ?? "PI_TOOL_FAILED" };
        }
      } else {
        await write({ status: "running", messages: checkpoint.messages });
      }
      const tools = this.options.tools.map((tool): AgentTool => ({
        ...tool,
        replay: "never",
        executionMode: "sequential",
        execute: async (id, args, activeSignal) => {
          if (
            failure ||
            signal.aborted ||
            activeSignal?.aborted ||
            (this.options.effectful?.(tool.name) !== false && checkpoint.pendingEffect?.id !== id)
          )
            throw stop(failure ?? "PI_TOOL_DENIED");
          try {
            // The durable authorized intent already exists before any caller effect starts.
            this.options.onActivity?.({ type: "tool", id, name: tool.name, status: "running" });
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
              if (event.type === "text_delta")
                this.options.onActivity?.({ type: "message-delta", text: event.delta });
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
          try {
            const messages = prepareModelContext(
              authoritative.messages,
              this.options.model,
              tools,
            ).messages;
            return { context: { messages, tools } };
          } catch (error) {
            throw stop(
              error instanceof Error && error.message === "AI_CONTEXT_INCOMPATIBLE"
                ? "PI_CONTEXT_INCOMPATIBLE"
                : "PI_CONTEXT_TOO_LARGE",
            );
          }
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
          const effectful = this.options.effectful?.(toolCall.name) !== false;
          const pendingApproval =
            effectful &&
            args &&
            typeof args === "object" &&
            !Array.isArray(args) &&
            recoverablePiApproval(checkpoint, toolCall.id)
              ? {
                  requestId: crypto.randomUUID(),
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: structuredClone(args as Record<string, unknown>),
                }
              : undefined;
          if (pendingApproval) await write({ ...checkpoint, pendingApproval });
          let decision: "allow" | "deny" = "deny";
          pause();
          try {
            decision = await this.options.authorize(
              {
                id: toolCall.id,
                name: toolCall.name,
                arguments: structuredClone(args),
                ...(pendingApproval ? { requestId: pendingApproval.requestId } : {}),
              },
              activeSignal ?? signal,
            );
          } catch {
            /* An unavailable approval is never authorization. */
          } finally {
            resume();
          }
          if (decision !== "allow" || signal.aborted || activeSignal?.aborted) {
            failure ??= "PI_TOOL_DENIED";
            return { block: true, terminate: true, reason: "PI_TOOL_DENIED" };
          }
          if (effectful)
            await write({
              status: "running",
              messages: checkpoint.messages,
              pendingEffect: { id: toolCall.id, name: toolCall.name },
            });
          return undefined;
        },
      });
      this.agent = agent;
      agent.subscribe(async (event) => {
        if (this.suspended) return;
        if (event.type === "tool_execution_end")
          this.options.onActivity?.({
            type: "tool-result",
            id: event.toolCallId,
            failed: event.isError,
          });
        if (event.type === "message_end" && event.message.role === "assistant") {
          const message = event.message;
          const text = message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n\n");
          this.options.onActivity?.({
            type: "message",
            text,
            complete: true,
            unlessStreamed: true,
          });
          this.options.onActivity?.({
            type: "usage",
            cumulative: false,
            known: true,
            totals: {
              inputTokens: message.usage.input,
              outputTokens: message.usage.output,
              cachedInputTokens: message.usage.cacheRead,
              cacheWriteInputTokens: message.usage.cacheWrite,
            },
          });
        }
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
      if (approval) await agent.continue();
      else await agent.prompt(prompt.trim());
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
      if (!this.suspended && failure !== "PI_PERSISTENCE_FAILED")
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
