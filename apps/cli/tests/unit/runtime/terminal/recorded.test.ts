import { expect, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { hookDecision, parseHookInvocation } from "../../../../src/runtime/terminal/protocol";
import { ConversationRecorder } from "../../../../src/runtime/agents/activity";
import type { ActivityDraft } from "../../../../src/runtime/agents/store";

import type { AgentProvider, HumanDecision, TaskActivity } from "@raypx/core/tasks";

const directory = fileURLToPath(new URL("../../../fixtures/terminal/recorded", import.meta.url));
type Fixture = {
  provenance: { provider: AgentProvider; source: string; version: string };
  records: Record<string, unknown>[];
  expectedMessage?: string;
};
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(join(directory, name + ".json"), "utf8"));
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

it.each([
  "claude-permission-allow",
  "claude-permission-deny",
  "codex-permission-allow",
  "codex-permission-deny",
  "codex-permission-fallback",
  "claude-permission-fallback",
  "claude-permission-disconnected",
  "claude-permission-expired",
  "codex-permission-disconnected",
  "codex-permission-expired",
])("replays the real recorded hook contract: %s", (name) => {
  const value = fixture(name);
  expect(value.provenance.source).toBe("real-cli");
  expect(value.provenance.version).toBeTruthy();
  const inputs = value.records.filter((record) => record.input);
  expect(inputs).toHaveLength(1);
  const invocation = parseHookInvocation(value.provenance.provider, inputs[0]!.input)!;
  expect(invocation.tool).toBe("Bash");
  const outputs = value.records.filter((record) => record.output);
  const hasDecision = name.endsWith("allow") || name.endsWith("deny");
  const decision: HumanDecision = name.endsWith("allow")
    ? { type: "allow" }
    : { type: "deny", note: "P0 contract test declined this request" };
  expect(outputs).toHaveLength(hasDecision ? 1 : 0);
  expect(value.records.filter((record) => record.fallback)).toHaveLength(hasDecision ? 0 : 1);
  expect(hasDecision ? hookDecision(invocation, decision) : undefined).toEqual(outputs[0]?.output);
});

it.each(["claude", "codex"] as const)(
  "projects real %s conversation and usage records without duplicated streamed text",
  (provider) => {
    const value = fixture(provider + "-stream"),
      entries = new Map<string, TaskActivity>();
    const write = (draft: ActivityDraft): TaskActivity => {
      const old = entries.get(draft.id);
      const entry = {
        ...structuredClone(draft),
        order: old?.order ?? entries.size + 1,
        revision: (old?.revision ?? 0) + 1,
      };
      entries.set(entry.id, entry);
      return entry;
    };
    const recorder = new ConversationRecorder(crypto.randomUUID(), write);
    recorder.setTokenBaseline({
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
    });
    recorder.startTurn();
    for (const record of value.records) {
      if (provider === "claude") recorder.claude(record);
      else recorder.codex(String(record.method), object(record.params));
    }
    recorder.stop("complete");
    const messages = [...entries.values()].filter((entry) => entry.kind === "message");
    expect(messages.filter((entry) => entry.text === value.expectedMessage)).toHaveLength(1);
    const usages = [...entries.values()].filter((entry) => entry.kind === "usage");
    expect(usages).toHaveLength(1);
    expect(usages[0]?.known).toBe(true);
    expect(usages[0]?.inputTokens).toBeGreaterThan(0);
    let expectedUsage: { inputTokens: unknown; outputTokens: unknown; cachedInputTokens?: unknown };
    if (provider === "codex") {
      const usage = value.records.find((record) => record.method === "thread/tokenUsage/updated")!;
      const total = object(object(object(usage.params).tokenUsage).total);
      expectedUsage = {
        inputTokens: total.inputTokens,
        outputTokens: total.outputTokens,
        cachedInputTokens: total.cachedInputTokens,
      };
    } else {
      const total = object(
        [...value.records].reverse().find((record) => record.type === "result")!.usage,
      );
      expectedUsage = {
        inputTokens:
          Number(total.input_tokens) +
          Number(total.cache_read_input_tokens) +
          Number(total.cache_creation_input_tokens),
        outputTokens: total.output_tokens,
      };
    }
    expect(usages[0]).toMatchObject(expectedUsage);
  },
);
