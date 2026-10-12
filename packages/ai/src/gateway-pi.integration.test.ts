import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { createCloudPiAgent } from "./cloud-pi.js";

it("runs the real packaged Pi session through injected Gateway streaming without local metering or credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "voidmix-gateway-pi-"));
  const reserve = vi.fn(async () => {}),
    start = vi.fn(async () => {}),
    settle = vi.fn(async () => {});
  const events: { type: string }[] = [];
  const transport = vi.fn(async () =>
    (async function* () {
      const message = {
        role: "assistant",
        content: [{ type: "text", text: "Verified through Gateway" }],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "claude-haiku-4-5",
        stopReason: "stop",
        timestamp: Date.now(),
        usage: {
          input: 10,
          output: 4,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 14,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      yield { type: "start", partial: message };
      yield { type: "done", reason: "stop", message };
    })(),
  );
  try {
    const result = await createCloudPiAgent({
      model: { provider: "anthropic", id: "claude-haiku-4-5" },
      transport,
    }).run({
      cwd: directory,
      prompt: "Verify",
      systemPrompt: "Trusted test session",
      tools: [],
      maxOutputTokens: 100,
      hooks: { reserve, start, settle },
      signal: new AbortController().signal,
      onEvent: async (event) => {
        events.push(event);
      },
    });
    expect(result).toEqual({ type: "completed", text: "Verified through Gateway" });
    expect(events.some((event) => event.type === "message_completed")).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(reserve).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
