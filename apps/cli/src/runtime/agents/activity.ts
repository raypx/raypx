import type { ConversationSink, TokenTotals } from "@raypx/provider-core";
import { recordCodexActivity } from "@raypx/provider-codex";
import { recordClaudeActivity } from "@raypx/provider-claude";
import { taskText } from "@raypx/core/task-text";

import type { AgentProvider, TaskActivity } from "@raypx/core/tasks";
import type { ActivityDraft } from "./store";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
type Message = Extract<ActivityDraft, { kind: "message" }>;
type Tool = Extract<ActivityDraft, { kind: "tool" }>;
export type { TokenTotals } from "@raypx/provider-core";

/** Select public conversation fields; reasoning, tool output and provider envelopes stay private. */
export class ConversationRecorder implements ConversationSink {
  readonly entries = new Map<string, ActivityDraft>();
  private readonly dirty = new Set<string>();
  readonly streamedMessages = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  turn = 0;
  private startedAt = Date.now();
  currentMessage = "";
  private stopped = false;
  totals: TokenTotals | undefined;
  turnUsage: TokenTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
  };
  usageKnown = true;
  codexTurn = "";
  blockIndex = 0;
  constructor(
    private readonly taskId: string,
    private readonly write: (entry: ActivityDraft) => TaskActivity,
    private readonly interval = 250,
    readonly persistTotals?: (value: TokenTotals) => void,
  ) {}
  setTokenBaseline(value: TokenTotals | undefined) {
    this.totals = value;
  }
  setTurnId(value: string) {
    this.codexTurn = value;
  }
  record(provider: AgentProvider, message: Record<string, unknown>) {
    if (provider === "codex") this.codex(text(message.method), object(message.params));
    else this.claude(message);
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
  message(key: string, value: string, complete: boolean, append = false) {
    this.currentMessage = key;
    let entry = this.entries.get(key) as Message | undefined;
    const created = !entry;
    if (!entry) {
      entry = { ...this.base(), kind: "message", text: "", status: "streaming", truncated: false };
      this.entries.set(key, entry);
    }
    const next = append ? (entry.truncated ? entry.text : entry.text + value) : value;
    const clipped = taskText(next, 32_000);
    if (
      !created &&
      entry.text === clipped &&
      entry.status === (complete ? "complete" : "streaming") &&
      (entry.truncated || next.length <= 32_000)
    )
      return;
    entry.text = clipped;
    entry.truncated ||= next.length > 32_000;
    entry.status = complete ? "complete" : "streaming";
    this.save(key, created || complete);
  }
  tool(id: string, name: string, status: Tool["status"]) {
    const key = `tool:${id}`;
    let entry = this.entries.get(key) as Tool | undefined;
    if (!entry) {
      entry = { ...this.base(), kind: "tool", name: taskText(name, 120), status };
      this.entries.set(key, entry);
    } else if (entry.status === "running" || status !== "running") entry.status = status;
    this.save(key, true);
  }
  usage(
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
    recordCodexActivity(this, method, params);
  }
  claude(message: Record<string, unknown>) {
    recordClaudeActivity(this, message);
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
