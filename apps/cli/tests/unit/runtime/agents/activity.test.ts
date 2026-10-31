import { bounded } from "../../../../src/runtime/agents";
import { expect, it, vi } from "vite-plus/test";
import { ConversationRecorder } from "../../../../src/runtime/agents/activity";
import type { ActivityDraft } from "../../../../src/runtime/agents/store";

import type { TaskActivity } from "@raypx/core/tasks";

function recorder() {
  const entries = new Map<string, TaskActivity>();
  const write = vi.fn((draft: ActivityDraft): TaskActivity => {
    const old = entries.get(draft.id);
    const value = {
      ...draft,
      order: old?.order ?? entries.size + 1,
      revision: (old?.revision ?? 0) + 1,
    };
    entries.set(value.id, value);
    return value;
  });
  return { recorder: new ConversationRecorder(crypto.randomUUID(), write), entries, write };
}
it("accumulates total usage across calls, rejects duplicate or old-turn updates and reuses fallback message identity", () => {
  const { recorder: r, entries, write } = recorder();
  r.setTokenBaseline({
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
  });
  r.startTurn();
  r.setTurnId("one");
  const update = (inputTokens: number, outputTokens: number, turnId = "one") =>
    r.codex("thread/tokenUsage/updated", {
      turnId,
      tokenUsage: {
        total: { inputTokens, outputTokens },
        last: { inputTokens: 6, outputTokens: 2 },
      },
    });
  update(10, 3);
  update(16, 5);
  const calls = write.mock.calls.length;
  update(16, 5);
  update(99, 99, "old");
  expect(write).toHaveBeenCalledTimes(calls);
  expect([...entries.values()].find((entry) => entry.kind === "usage")).toMatchObject({
    inputTokens: 16,
    outputTokens: 5,
    known: true,
  });
  r.codex("item/agentMessage/delta", { delta: "x".repeat(40_000) });
  r.flush();
  const boundedCalls = write.mock.calls.length;
  r.codex("item/agentMessage/delta", { delta: "more" });
  r.flush();
  expect(write).toHaveBeenCalledTimes(boundedCalls);
  r.codex("item/completed", { item: { type: "agentMessage", text: "x".repeat(32_000) } });
  expect([...entries.values()].filter((entry) => entry.kind === "message")).toHaveLength(1);
  r.endTurn("complete");
  r.startTurn();
  r.setTurnId("two");
  update(24, 7, "two");
  r.stop("complete");
  expect(
    [...entries.values()]
      .filter((entry) => entry.kind === "usage")
      .map((entry) => entry.inputTokens),
  ).toEqual([16, 8]);
});
it("joins streaming and final Claude messages by identity and excludes reasoning, child runs and tool content", () => {
  const { recorder: r, entries } = recorder();
  r.startTurn();
  r.claude({ type: "stream_event", event: { type: "message_start", message: { id: "m" } } });
  r.claude({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "PRIVATE_REASONING" },
    },
  });
  r.claude({
    type: "stream_event",
    event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } },
  });
  r.claude({
    type: "assistant",
    message: {
      id: "m",
      content: [
        { type: "text", text: "Hello" },
        { type: "tool_use", id: "t", name: "Read", input: { path: "PRIVATE_PATH" } },
      ],
    },
  });
  r.claude({
    type: "stream_event",
    event: { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: " world" } },
  });
  r.claude({
    type: "assistant",
    message: { id: "m", content: [{ type: "text", text: " world" }] },
  });
  r.claude({ type: "stream_event", event: { type: "message_stop" } });
  r.claude({
    type: "user",
    message: { content: [{ type: "tool_result", tool_use_id: "t", content: "PRIVATE_STDOUT" }] },
  });
  r.claude({
    type: "assistant",
    parent_tool_use_id: "t",
    message: { content: [{ type: "text", text: "PRIVATE_CHILD" }] },
  });
  r.claude({
    type: "result",
    usage: {
      input_tokens: 10,
      output_tokens: 3,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 5,
    },
    duration_ms: 100,
  });
  r.stop("complete");
  const values = [...entries.values()];
  expect(values.filter((entry) => entry.kind === "message")).toHaveLength(1);
  expect(values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "message",
        text: "Hello\n world",
        status: "complete",
        revision: 2,
      }),
      expect.objectContaining({ kind: "tool", name: "Read", status: "succeeded" }),
      expect.objectContaining({
        kind: "usage",
        inputTokens: 35,
        outputTokens: 3,
        cachedInputTokens: 20,
      }),
    ]),
  );
  expect(JSON.stringify(values)).not.toContain("PRIVATE_");
});
it("retains bounded Codex text, finalizes cancellation and never includes command output or reasoning tokens", () => {
  const { recorder: r, entries, write } = recorder();
  r.startTurn();
  r.codex("item/started", {
    item: {
      type: "commandExecution",
      id: "c",
      command: "PRIVATE_COMMAND",
      aggregatedOutput: "PRIVATE_STDOUT",
    },
  });
  r.codex("item/started", {
    item: { type: "reasoning", id: "private", text: "PRIVATE_REASONING" },
  });
  r.codex("item/agentMessage/delta", { itemId: "m", delta: "x".repeat(40_000) });
  r.stop("interrupted");
  const calls = write.mock.calls.length;
  r.stop("interrupted");
  expect(write).toHaveBeenCalledTimes(calls);
  const values = [...entries.values()];
  expect(values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "message",
        text: "x".repeat(32_000),
        truncated: true,
        status: "interrupted",
      }),
      expect.objectContaining({ kind: "tool", status: "interrupted" }),
    ]),
  );
  expect(JSON.stringify(values)).not.toContain("PRIVATE_");
});

it("marks a cumulative counter reset unknown, then counts subsequent updates from the new baseline", () => {
  const { recorder: r, entries } = recorder();
  r.setTokenBaseline({
    inputTokens: 1000,
    outputTokens: 100,
    cachedInputTokens: 200,
    cacheWriteInputTokens: 0,
  });
  r.startTurn();
  r.setTurnId("reset");
  const update = (inputTokens: number) =>
    r.codex("thread/tokenUsage/updated", {
      turnId: "reset",
      tokenUsage: { total: { inputTokens, outputTokens: 5, cachedInputTokens: 1 } },
    });
  update(10);
  update(30);
  expect([...entries.values()].find((entry) => entry.kind === "usage")).toMatchObject({
    known: false,
    inputTokens: 20,
  });
  r.endTurn("complete");
  r.startTurn();
  r.setTurnId("reset");
  update(50);
  r.stop("complete");
  expect(
    [...entries.values()]
      .filter((entry) => entry.kind === "usage")
      .map((entry) => ({ known: entry.known, input: entry.inputTokens })),
  ).toEqual([
    { known: false, input: 20 },
    { known: true, input: 20 },
  ]);
});
it("never appends into a partially filled Unicode truncation boundary", () => {
  const { recorder: r, entries } = recorder();
  r.startTurn();
  r.codex("item/agentMessage/delta", { itemId: "unicode", delta: "x".repeat(31999) + "😀" });
  r.codex("item/agentMessage/delta", { itemId: "unicode", delta: "later" });
  r.stop("complete");
  expect([...entries.values()].find((entry) => entry.kind === "message")).toMatchObject({
    text: "x".repeat(31999),
    truncated: true,
  });
});

it("keeps oversized local records from stalling replay or hiding approvals", () => {
  const large = "界".repeat(100_000);
  expect(bounded([large, "next"])).toEqual([large]);
  expect(bounded(["small", large, "after"])).toEqual(["small"]);
  expect(bounded(["small", large, "after"], true)).toEqual(["small", "after"]);
});
