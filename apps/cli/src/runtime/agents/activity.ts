import type { ConversationEvent, TokenTotals } from "@raypx/providers/core";
import { taskText } from "@raypx/core/task-text";

import type { TaskActivity } from "@raypx/core/tasks";
import type { ActivityDraft } from "./model";
import type { ExecutionConversation } from "./harness/ports";
import { cryptoIds, systemClock, type Clock, type Ids } from "./domain/ports";

type Message = Extract<ActivityDraft, { kind: "message" }>;
type Tool = Extract<ActivityDraft, { kind: "tool" }>;
export type { TokenTotals } from "@raypx/providers/core";

/** Select public conversation fields; reasoning, tool output and provider envelopes stay private. */
export class ConversationRecorder implements ExecutionConversation {
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
  private providerTurn = "";
  private blockIndex = 0;
  constructor(
    private readonly taskId: string,
    private readonly write: (entry: ActivityDraft) => TaskActivity,
    private readonly interval = 250,
    readonly persistTotals?: (value: TokenTotals) => void,
    private readonly clock: Clock = systemClock,
    private readonly ids: Ids = cryptoIds,
  ) {}
  setTokenBaseline(value: TokenTotals | undefined) {
    this.totals = value;
  }
  setTurnId(value: string) {
    this.providerTurn = value;
  }
  record(event: ConversationEvent) {
    if (this.stopped) return;
    if (event.type === "turn") this.providerTurn = event.id;
    else if (event.type === "message-start") {
      this.currentMessage = event.id;
      this.blockIndex = 0;
    } else if (event.type === "message-delta") {
      const key = event.id ?? this.currentMessage,
        previous = this.entries.get(key);
      this.streamedMessages.add(key);
      this.message(
        key,
        (event.block !== undefined &&
        previous?.kind === "message" &&
        previous.text &&
        event.block !== this.blockIndex
          ? "\n"
          : "") + event.text,
        false,
        true,
      );
      if (event.block !== undefined) this.blockIndex = event.block;
    } else if (event.type === "message-end") {
      const entry = this.entries.get(this.currentMessage);
      if (entry?.kind === "message") this.message(this.currentMessage, entry.text, true);
    } else if (event.type === "message") {
      const key = event.id ?? this.currentMessage;
      if (event.unlessStreamed && this.streamedMessages.has(key)) return;
      if (event.unlessPresent && this.entries.has(key)) return;
      this.message(key, event.text, event.complete);
    } else if (event.type === "tool") this.tool(event.id, event.name, event.status);
    else if (event.type === "tool-result") {
      const previous = this.entries.get(`tool:${event.id}`);
      if (previous?.kind === "tool")
        this.tool(event.id, previous.name, event.failed ? "failed" : "succeeded");
    } else if (event.type === "usage") {
      if (event.turnId && this.providerTurn && event.turnId !== this.providerTurn) return;
      const value = event.totals;
      if (!event.cumulative) {
        this.usage(
          value.inputTokens,
          value.outputTokens,
          value.cachedInputTokens,
          value.cacheWriteInputTokens,
          event.durationMs,
          event.known,
        );
        return;
      }
      if (!this.turn && event.known) {
        this.totals = value;
        this.persistTotals?.(value);
        return;
      }
      if (!event.known) {
        this.usageKnown = false;
        this.usage(0, 0, 0, 0, undefined, false);
        return;
      }
      const keys = Object.keys(value) as (keyof TokenTotals)[];
      if (this.totals && keys.some((key) => value[key] < this.totals![key]))
        this.usageKnown = false;
      else if (this.totals) {
        if (keys.every((key) => value[key] === this.totals![key])) return;
        for (const key of keys) this.turnUsage[key] += value[key] - this.totals[key];
      } else this.usageKnown = false;
      this.totals = value;
      this.persistTotals?.(value);
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
  private base() {
    const now = this.clock.now().toISOString();
    return { id: this.ids.generate(), taskId: this.taskId, createdAt: now, updatedAt: now };
  }
  startTurn() {
    this.turn++;
    this.startedAt = Date.now();
    this.currentMessage = `turn:${this.turn}`;
    this.providerTurn = "";
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
    entry.updatedAt = this.clock.now().toISOString();
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
  private tool(id: string, name: string, status: Tool["status"]) {
    const key = `tool:${id}`;
    let entry = this.entries.get(key) as Tool | undefined;
    if (!entry) {
      entry = { ...this.base(), kind: "tool", name: taskText(name, 120), status };
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
