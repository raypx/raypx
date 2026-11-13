import { afterEach, expect, it, vi } from "vitest";
import { AiError } from "@raypx/ai";
import { createApiClient } from "@raypx/client/api";
import type { ConversationServerFrame } from "@raypx/contracts/api";
import { createApiApp } from "../../tests/helpers/app.js";
import { replyFixture } from "../../tests/helpers/replies.js";
import { ConversationStream } from "./stream.js";
import { createApiLogging } from "../logging.js";
import { createDeploymentModels } from "./models.js";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
function fixture() {
  const f = replyFixture();
  cleanups.push(() => f.runner.close());
  const logs: unknown[] = [];
  const logging = createApiLogging({
    environment: "test",
    sink: ({ event }) => {
      logs.push(event);
    },
  });
  cleanups.push(() => logging.close());
  const app = createApiApp({ ...f, logger: logging, allowedOrigins: ["https://web.example.test"] });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    headers: { origin: "https://web.example.test" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
  const selection = { spaceId: f.spaceId, conversationId: f.conversationId };
  const send = (key = "first") =>
    client.conversations.send({
      ...selection,
      message: { idempotencyKey: key, text: "Private member input" },
    });
  return { ...f, client, selection, send, logs, logging };
}
async function subscribe(f: ReturnType<typeof fixture>, stream: ConversationStream, id: string) {
  const frames: ConversationServerFrame[] = [];
  stream.open(id, "member", new Headers(), {
    send(frame) {
      frames.push(frame);
      if (frame.type === "event")
        queueMicrotask(() =>
          stream.receive(
            id,
            JSON.stringify({
              ...f.selection,
              version: 1,
              type: "ack",
              sequence: frame.entry.event.sequence,
            }),
          ),
        );
    },
    close() {},
  });
  stream.receive(id, JSON.stringify({ ...f.selection, version: 1, type: "subscribe", after: 0 }));
  return frames;
}
function text(frames: ConversationServerFrame[]) {
  let value = "";
  for (const frame of frames) {
    if (frame.type === "reply.prefix") value = frame.text;
    if (frame.type === "reply.delta") {
      if (frame.offset !== value.length) throw new Error("Noncontiguous live delta");
      value += frame.text;
    }
    if (frame.type === "event" && frame.entry.event.kind === "reply.segment")
      value = frame.entry.event.segment.text;
  }
  return value;
}
it("returns the HTTP send before completion; streams deltas, joins mid-segment and commits one segment with first response", async () => {
  const f = fixture();
  const stream = new ConversationStream({ ...f, pollMs: 10 });
  await stream.start();
  cleanups.push(() => stream.shutdown());
  const first = await subscribe(f, stream, "first");
  await f.send();
  expect(f.segments).toHaveLength(0);
  await expect.poll(() => f.calls.length).toBe(1);
  await expect.poll(() => first.some((frame) => frame.type === "reply.prefix")).toBe(true);
  f.calls[0]!.reasoning("Private reasoning");
  f.calls[0]!.delta("Hello");
  await expect.poll(() => text(first)).toBe("Hello");
  const middle = await subscribe(f, stream, "middle");
  await expect.poll(() => text(middle)).toBe("Hello");
  expect(middle.find((frame) => frame.type === "reply.prefix")).toMatchObject({
    text: "Hello",
    offset: 0,
  });
  f.calls[0]!.delta(" world");
  await expect.poll(() => text(first)).toBe("Hello world");
  await expect.poll(() => text(middle)).toBe("Hello world");
  expect(f.log.some((entry) => entry.event.kind === "reply.segment")).toBe(false);
  f.calls[0]!.complete();
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  await expect
    .poll(() =>
      middle.some((frame) => frame.type === "event" && frame.entry.event.kind === "reply.segment"),
    )
    .toBe(true);
  expect(f.segments).toHaveLength(1);
  expect(JSON.stringify(f.log)).not.toContain("Private reasoning");
  expect(Date.parse(f.runs[0]!.firstResponseAt!)).toBeLessThanOrEqual(
    Date.parse(f.segments[0]!.createdAt),
  );
  expect(text(first)).toBe(text(middle));
  expect(first.some((frame) => frame.type === "reply.delta")).toBe(true);
});
it("queues a second message without concurrent execution and preserves idempotent send", async () => {
  const f = fixture();
  const first = await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  await f.send("second");
  expect(await f.send()).toEqual(first);
  expect(f.runs.map((run) => run.state)).toEqual(["running", "queued"]);
  expect(f.calls).toHaveLength(1);
  f.calls[0]!.delta("First");
  f.calls[0]!.complete();
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.runs.map((run) => run.state)).toEqual(["succeeded", "running"]);
  f.calls[1]!.complete();
  await expect.poll(() => f.runs[1]!.state).toBe("succeeded");
});
it("stop commits cancelled, aborts the request, discards the open segment and starts the next Run", async () => {
  const f = fixture();
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.delta("Uncommitted");
  await f.send("next");
  const result = await f.client.conversations.stop({ ...f.selection, runId: f.runs[0]!.id });
  expect(result.state).toBe("cancelled");
  expect(f.calls[0]!.signal.aborted).toBe(true);
  await expect.poll(() => f.calls.length).toBe(2);
  expect(f.segments).toHaveLength(0);
  expect(
    f.log.filter((entry) => entry.event.kind === "run.state" && entry.event.state === "cancelled"),
  ).toHaveLength(1);
  await f.client.conversations.stop({ ...f.selection, runId: f.runs[1]!.id });
});
it("a missing model fails visibly with no fallback; absent credentials are explicit", async () => {
  for (const [models, code] of [
    [createDeploymentModels("[]", "{}"), "MODEL_UNAVAILABLE"],
    [
      createDeploymentModels(
        JSON.stringify([
          { modelId: "fixture", provider: "unused", model: "unused", credentialId: "missing" },
        ]),
        "{}",
      ),
      "MODEL_NOT_CONFIGURED",
    ],
  ] as const) {
    const f = fixture();
    vi.mocked(f.models.resolve).mockImplementation((run) => models.resolve(run));
    cleanups.push(async () => models.close());
    await f.send();
    await expect.poll(() => f.runs[0]!.state).toBe("failed");
    expect(f.runs[0]!.failureCode).toBe(code);
    expect(f.calls).toHaveLength(0);
    expect(f.log.at(-1)!.event).toMatchObject({
      kind: "run.state",
      state: "failed",
      failureCode: code,
    });
  }
});
it("sanitizes thrown and streamed provider errors before persistence or diagnostics", async () => {
  const f = fixture();
  vi.mocked(f.models.resolve).mockRejectedValueOnce(
    new Error("private-provider-message credential=secret-fixture"),
  );
  await f.send();
  await expect.poll(() => f.runs[0]!.state).toBe("failed");
  await f.send("stream-error");
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.fail();
  await expect.poll(() => f.runs[1]!.state).toBe("failed");
  expect(f.runs.map((run) => run.failureCode)).toEqual(["MODEL_FAILED", "MODEL_FAILED"]);
  await f.logging.flush();
  expect(JSON.stringify([f.log, f.diagnostics, f.logs])).not.toMatch(
    /private-provider-message|secret-fixture/,
  );
  expect(JSON.stringify(f.logs)).not.toMatch(/Private member input|Private reasoning/);
  expect(f.diagnostics).toEqual([]);
  expect(f.segments).toHaveLength(0);
});
it("passes stable AI failure codes without provider details", async () => {
  const f = fixture();
  vi.mocked(f.models.resolve).mockRejectedValue(new AiError("AI_TIMEOUT"));
  await f.send();
  await expect.poll(() => f.runs[0]!.failureCode).toBe("MODEL_TIMEOUT");
});

it("stopping a queued Run is idempotent and never invokes a second request", async () => {
  const f = fixture();
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  await f.send("queued");
  const selection = { ...f.selection, runId: f.runs[1]!.id };
  const stopped = await f.client.conversations.stop(selection);
  expect(await f.client.conversations.stop(selection)).toEqual(stopped);
  f.calls[0]!.complete();
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  expect(f.calls).toHaveLength(1);
  expect(f.runs[1]!.state).toBe("cancelled");
});

it("commits authoritative final text even when the model finishes without text deltas", async () => {
  const f = fixture();
  await f.send();
  await expect.poll(() => f.calls.length).toBe(1);
  f.calls[0]!.complete("Final reply");
  await expect.poll(() => f.runs[0]!.state).toBe("succeeded");
  expect(f.segments[0]!.text).toBe("Final reply");
  expect(f.runs[0]!.firstResponseAt).not.toBeNull();
});
