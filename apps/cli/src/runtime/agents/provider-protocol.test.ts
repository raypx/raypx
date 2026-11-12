import { expect, it, vi } from "vitest";
import { CodexAdapter } from "@raypx/providers/codex";
import { parseProviderReplay, ProviderReplay } from "../../../tests/helpers/provider-replay.js";
import type { ReplayRecord } from "../../../tests/helpers/provider-replay.js";
import { bootstrap, fixture } from "../../../tests/helpers/provider-session.js";

it("validates replay records and reports directional mismatches without exposing payloads", async () => {
  expect(() => parseProviderReplay('{"direction":"provider","message":{},"extra":true}')).toThrow(
    "line 1",
  );
  expect(() => parseProviderReplay('{"direction":"exit","code":"bad"}')).toThrow("line 1");
  const replay = new ProviderReplay([
    { direction: "host", channel: "request", method: "expected" },
  ]);
  replay.factory("synthetic", [], "/synthetic", () => {});
  await expect(
    replay.process.request("other", { secret: "synthetic-private-text" }),
  ).rejects.toThrow("record 1");
  await expect(replay.drain()).rejects.toThrow("Provider replay mismatch at record 1");
});

it.each(["codex", "claude"] as const)(
  "keeps %s steer delivery faithful to its protocol",
  async (provider) => {
    const interrupt: ReplayRecord[] =
      provider === "codex"
        ? [
            {
              direction: "host",
              channel: "request",
              method: "turn/steer",
              message: {
                threadId: "synthetic-session",
                expectedTurnId: "synthetic-turn-1",
                input: [{ type: "text", text: "Steered synthetic input" }],
              },
            },
            { direction: "gate", name: "steered" },
            {
              direction: "provider",
              message: {
                method: "turn/completed",
                params: { turn: { id: "synthetic-turn-1", status: "completed" } },
              },
            },
          ]
        : [
            { direction: "host", channel: "control", message: { subtype: "interrupt" } },
            { direction: "gate", name: "interrupted" },
            {
              direction: "provider",
              message: { type: "result", is_error: true, result: "Synthetic interrupted result" },
            },
            {
              direction: "host",
              channel: "send",
              message: {
                type: "user",
                session_id: "synthetic-session",
                message: { content: "Steered synthetic input" },
              },
            },
            { direction: "gate", name: "steered" },
            {
              direction: "provider",
              message: { type: "result", result: "Synthetic steered result" },
            },
          ];
    const f = fixture(provider, [
      ...bootstrap(provider),
      ...interrupt,
      { direction: "host", channel: "kill" },
      { direction: "exit", code: 0 },
    ]);
    await f.replay.wait("started");
    await f.running;
    const input = f.execution.enqueue({
      id: crypto.randomUUID(),
      mode: "steer",
      prompt: "Steered synthetic input",
    });
    f.replay.release("started");
    await f.replay.wait(provider === "claude" ? "interrupted" : "steered");
    if (provider === "codex") await f.waitActivity(input.id, "sent");
    expect(f.inputStatus(input.id)).toBe(provider === "claude" ? "sending" : "sent");
    expect(f.replay.sent.filter((call) => call.channel === "send")).toHaveLength(1);
    if (provider === "claude") f.replay.release("interrupted");
    await f.replay.wait("steered");
    await f.waitActivity(input.id, "sent");
    f.replay.release("steered");
    await f.finished();
    expect(f.local.task.status).toBe("succeeded");
    expect(f.unlock).toHaveBeenCalledTimes(1);
  },
);

it("keeps drain pending for queued protocol operations and tracked asynchronous delivery", async () => {
  const replay = new ProviderReplay([
    { direction: "gate", name: "release" },
    { direction: "host", channel: "request", method: "synthetic" },
  ]);
  replay.factory("synthetic", [], "/synthetic", () => {});
  let finish!: () => void;
  const delivery = replay.track(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  const request = replay.process.request("synthetic", {}),
    drained = vi.fn();
  const drain = replay.drain().then(drained);
  expect(replay.pending).toMatchObject({ queued: 1, inFlight: 1 });
  replay.release("release");
  await request;
  expect(drained).not.toHaveBeenCalled();
  finish();
  await delivery;
  await drain;
  expect(replay.pending).toEqual({ queued: 0, inFlight: 0, remaining: 0 });
});

it("rejects the unscoped Codex input method without opening an approval", async () => {
  const response = { id: 1, error: { code: -32601, message: "Unsupported host request" } };
  const replay = new ProviderReplay([
    { direction: "gate", name: "request" },
    { direction: "provider", message: { id: 1, method: "tool/requestUserInput", params: {} } },
    { direction: "host", channel: "send", message: response },
    { direction: "exit", code: 0 },
  ]);
  const ask = vi.fn(async () => ({ type: "allow" as const }));
  const provider = new CodexAdapter(
    { executable: "codex", directory: "/synthetic-project", mode: "run", environment: {} },
    {
      approval: { ask, hook: () => ({ url: "http://127.0.0.1/hook", token: "fixture" }) },
      current: () => true,
      emit: vi.fn(),
    },
    replay.factory,
  );
  replay.release("request");
  await replay.drain();
  expect(await provider.transport.completed).toBe(0);
  expect(replay.sent).toMatchObject([{ channel: "send", message: response }]);
  expect(ask).not.toHaveBeenCalled();
});

it.each(["item/commandExecution/requestApproval", "item/tool/requestUserInput"])(
  "fences a late %s reply after its process owner is cancelled",
  async (method) => {
    const replay = new ProviderReplay([
      { direction: "provider", message: { id: 1, method, params: {} } },
      { direction: "gate", name: "approval" },
      { direction: "exit", code: 0 },
    ]);
    let current = true,
      resolve!: (value: { type: "allow" }) => void;
    const answer = replay.track(
      new Promise<{ type: "allow" }>((done) => {
        resolve = done;
      }),
    );
    const failed = vi.fn();
    const provider = new CodexAdapter(
      { executable: "codex", directory: "/synthetic-project", mode: "run", environment: {} },
      {
        approval: {
          ask: () => answer,
          hook: () => ({ url: "http://127.0.0.1/hook", token: "fixture" }),
        },
        current: () => current,
        emit: vi.fn((event) => {
          if (event.type === "failed") failed();
        }),
      },
      replay.factory,
    );
    await replay.wait("approval");
    current = false;
    resolve({ type: "allow" });
    await answer;
    replay.release("approval");
    await replay.drain();
    expect(provider.transport).toBe(replay.process);
    expect(replay.sent).toEqual([]);
    expect(failed).not.toHaveBeenCalled();
  },
);
