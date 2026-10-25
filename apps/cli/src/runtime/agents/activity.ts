import type { TaskActivity } from "@raypx/contracts/tasks";
import type { ActivityDraft } from "./store";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
type Message = Extract<ActivityDraft, { kind: "message" }>;
type Tool = Extract<ActivityDraft, { kind: "tool" }>;
export type TokenTotals = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
};

/** Select public conversation fields; reasoning, tool output and provider envelopes stay private. */
export class ConversationRecorder {
  private readonly entries = new Map<string, ActivityDraft>();
  private readonly dirty = new Set<string>();
  private readonly streamedMessages = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private turn = 0;
  private startedAt = Date.now();
  private currentMessage = "";
  private stopped = false;
  private totals: TokenTotals | undefined;
  private turnUsage: TokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
  private usageKnown = true;
  private codexTurn = "";
  private blockIndex = 0;
  constructor(
    private readonly taskId: string,
    private readonly write: (entry: ActivityDraft) => TaskActivity,
    private readonly interval = 250,
    private readonly persistTotals?: (value: TokenTotals) => void,
  ) {}
  setTokenBaseline(value: TokenTotals | undefined) {
    this.totals = value;
  }
  setTurnId(value: string) {
    this.codexTurn = value;
  }
  private base() {
    const now = new Date().toISOString();
    return { id: crypto.randomUUID(), taskId: this.taskId, createdAt: now, updatedAt: now };
  }
  startTurn() {
    this.turn++;
    this.startedAt = Date.now();
    this.currentMessage = `turn:${this.turn}`;
    this.codexTurn = "";
    this.usageKnown = this.totals !== undefined;
    this.turnUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
    };
    this.blockIndex = 0;
  }
  private save(key: string, immediate = false) {
    if (this.stopped) return;
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.updatedAt = new Date().toISOString();
    this.dirty.add(key);
    if (immediate) this.flush();
    else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.interval);
      this.timer.unref();
    }
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const key of this.dirty) {
      const entry = this.entries.get(key);
      if (entry) this.write(entry);
    }
    this.dirty.clear();
  }
  private message(key: string, value: string, complete: boolean, append = false) {
    this.currentMessage = key;
    let entry = this.entries.get(key) as Message | undefined;
    const created = !entry;
    if (!entry) {
      entry = { ...this.base(), kind: "message", text: "", status: "streaming", truncated: false };
      this.entries.set(key, entry);
    }
    const next = append ? entry.text + value : value;
    if (
      !created &&
      entry.text === next.slice(0, 32_000) &&
      entry.status === (complete ? "complete" : "streaming") &&
      (entry.truncated || next.length <= 32_000)
    )
      return;
    entry.text = next.slice(0, 32_000);
    entry.truncated ||= next.length > 32_000;
    entry.status = complete ? "complete" : "streaming";
    this.save(key, created || complete);
  }
  private tool(id: string, name: string, status: Tool["status"]) {
    const key = `tool:${id}`;
    let entry = this.entries.get(key) as Tool | undefined;
    if (!entry) {
      entry = { ...this.base(), kind: "tool", name: name.slice(0, 120), status };
      this.entries.set(key, entry);
    } else if (entry.status === "running" || status !== "running") entry.status = status;
    this.save(key, true);
  }
  private usage(
    inputTokens: number,
    outputTokens: number,
    cachedInputTokens: number,
    cacheWriteTokens = 0,
    durationMs = Date.now() - this.startedAt,
    known = true,
  ) {
    const key = `usage:${this.turn}`;
    const old = this.entries.get(key);
    this.entries.set(key, {
      ...(old ?? this.base()),
      kind: "usage",
      inputTokens,
      outputTokens,
      cachedInputTokens,
      cacheWriteTokens,
      durationMs: Math.max(0, Math.round(durationMs)),
      known,
    });
    this.save(key, true);
  }
  codex(method: string, params: Record<string, unknown>) {
    if (method === "turn/started") this.codexTurn = text(object(params.turn).id);
    if (method === "item/agentMessage/delta") {
      const key = params.itemId ? `codex:${text(params.itemId)}` : this.currentMessage;
      this.message(key, text(params.delta), false, true);
    }
    if (method === "item/started" || method === "item/completed") {
      const item = object(params.item),
        id = text(item.id),
        kind = text(item.type);
      if (kind === "agentMessage")
        this.message(
          id ? `codex:${id}` : this.currentMessage,
          text(item.text),
          method === "item/completed",
        );
      const names: Record<string, string> = {
        commandExecution: "Shell",
        fileChange: "Edit",
        mcpToolCall: text(item.tool),
        dynamicToolCall: text(item.tool),
        webSearch: "WebSearch",
        imageView: "ViewImage",
        contextCompaction: "Compact",
      };
      if (Object.hasOwn(names, kind))
        this.tool(
          id || `${kind}:${this.turn}`,
          names[kind] || kind,
          method === "item/started"
            ? "running"
            : ["failed", "declined"].includes(text(item.status))
              ? "failed"
              : "succeeded",
        );
    }
    if (method === "thread/tokenUsage/updated") {
      if (params.turnId && this.codexTurn && params.turnId !== this.codexTurn) return;
      const total = object(object(params.tokenUsage).total);
      const usage: TokenTotals = {
        inputTokens: count(total.inputTokens),
        outputTokens: count(total.outputTokens),
        cachedInputTokens: count(total.cachedInputTokens),
        cacheWriteInputTokens: count(total.cacheWriteInputTokens),
      };
      if (!this.turn && Object.keys(total).length) {
        this.totals = usage;
        this.persistTotals?.(usage);
        return;
      }
      if (!Object.keys(total).length) {
        this.usageKnown = false;
        this.usage(0, 0, 0, 0, undefined, false);
        return;
      }
      if (this.totals) {
        if (
          (Object.keys(usage) as (keyof TokenTotals)[]).some(
            (key) => usage[key] < this.totals![key],
          )
        )
          return;
        if (
          (Object.keys(usage) as (keyof TokenTotals)[]).every(
            (key) => usage[key] === this.totals![key],
          )
        )
          return;
        for (const key of Object.keys(usage) as (keyof TokenTotals)[])
          this.turnUsage[key] += usage[key] - this.totals[key];
      } else this.usageKnown = false;
      this.totals = usage;
      this.persistTotals?.(usage);
      this.usage(
        this.turnUsage.inputTokens,
        this.turnUsage.outputTokens,
        this.turnUsage.cachedInputTokens,
        this.turnUsage.cacheWriteInputTokens,
        undefined,
        this.usageKnown,
      );
    }
  }
  claude(message: Record<string, unknown>) {
    if (message.parent_tool_use_id) return;
    const body = object(message.message);
    if (message.type === "stream_event") {
      const event = object(message.event),
        block = object(event.content_block),
        delta = object(event.delta);
      if (event.type === "message_start") {
        this.currentMessage = `claude:${text(object(event.message).id) || crypto.randomUUID()}`;
        this.blockIndex = 0;
      }
      if (event.type === "content_block_delta" && delta.type === "text_delta") {
        this.streamedMessages.add(this.currentMessage);
        const index = count(event.index),
          previous = this.entries.get(this.currentMessage);
        this.message(
          this.currentMessage,
          (previous?.kind === "message" && previous.text && index !== this.blockIndex ? "\n" : "") +
            text(delta.text),
          false,
          true,
        );
        this.blockIndex = index;
      }
      if (event.type === "message_stop") {
        const entry = this.entries.get(this.currentMessage);
        if (entry?.kind === "message") this.message(this.currentMessage, entry.text, true);
      }
      if (event.type === "content_block_start" && block.type === "tool_use")
        this.tool(text(block.id), text(block.name), "running");
    }
    if (message.type === "assistant" && Array.isArray(body.content)) {
      const key = body.id ? `claude:${text(body.id)}` : this.currentMessage;
      const content = body.content.map(object);
      const value = content
        .filter((block) => block.type === "text")
        .map((block) => text(block.text))
        .join("\n");
      // With partial messages enabled, assistant records can repeat only one
      // content block. The streamed text already contains every preceding block.
      if (value && !this.streamedMessages.has(key)) this.message(key, value, true);
      for (const block of content)
        if (block.type === "tool_use") this.tool(text(block.id), text(block.name), "running");
    }
    if (message.type === "user" && Array.isArray(body.content))
      for (const block of body.content.map(object))
        if (block.type === "tool_result") {
          const old = this.entries.get(`tool:${text(block.tool_use_id)}`) as Tool | undefined;
          if (old)
            this.tool(
              text(block.tool_use_id),
              old.name,
              block.is_error === true ? "failed" : "succeeded",
            );
        }
    if (message.type === "result") {
      if (text(message.result) && !this.entries.has(this.currentMessage))
        this.message(this.currentMessage, text(message.result), true);
      const usage = object(message.usage),
        read = count(usage.cache_read_input_tokens),
        write = count(usage.cache_creation_input_tokens);
      if (Object.keys(usage).length)
        this.usage(
          count(usage.input_tokens) + read + write,
          count(usage.output_tokens),
          read,
          write,
          count(message.duration_ms),
        );
    }
  }
  endTurn(status: "complete" | "interrupted") {
    for (const [key, entry] of this.entries) {
      if (entry.kind === "message" && entry.status === "streaming") {
        entry.status = status;
        this.save(key);
      }
      if (entry.kind === "tool" && entry.status === "running") {
        entry.status = "interrupted";
        this.save(key);
      }
    }
    const usage = this.entries.get(`usage:${this.turn}`);
    if (usage?.kind === "usage") {
      usage.durationMs = Math.max(usage.durationMs, Date.now() - this.startedAt);
      this.save(`usage:${this.turn}`);
    }
    this.flush();
  }
  stop(status: "complete" | "interrupted") {
    if (this.stopped) return;
    this.endTurn(status);
    this.stopped = true;
    clearTimeout(this.timer);
  }
}
