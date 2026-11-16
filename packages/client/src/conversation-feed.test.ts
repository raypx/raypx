import { expect, it, vi } from "vitest";
import { conversationFeedSelectionSchema } from "@raypx/contracts/api";
import { readConversationFeed } from "./conversation-feed.js";

const selection = conversationFeedSelectionSchema.parse({
  spaceId: "space",
  conversationId: "conversation",
  after: 8,
});
const origin = "https://api.example.test";

it("reads complete UTF-8 events across chunks and ignores heartbeats and partial records", async () => {
  const reply = {
    type: "reply.prefix",
    spaceId: selection.spaceId,
    conversationId: selection.conversationId,
    runId: "run",
    segmentId: "segment",
    offset: 0,
    text: "你好\n🙂",
  };
  const bytes = new TextEncoder().encode(
    `: heartbeat\n\ndata: ${JSON.stringify(reply)}\n\ndata: {"type":"ready","version":1}\n`,
  );
  const fetch = vi.fn(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream; charset=utf-8" } },
      ),
  );
  const frames = [];
  for await (const frame of readConversationFeed(origin, selection, {
    signal: new AbortController().signal,
    fetch,
  }))
    frames.push(frame);
  expect(frames).toEqual([reply]);
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    `${origin}/events?spaceId=space&conversationId=conversation&after=8`,
    expect.objectContaining({ credentials: "include", redirect: "error" }),
  );
});

it("makes the gateway's Retry-After available before opening another connection", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(null, {
        status: 429,
        headers: { "Retry-After": "45" },
      }),
  );
  const stream = readConversationFeed(origin, selection, {
    signal: new AbortController().signal,
    fetch,
  });
  await expect(stream.next()).resolves.toMatchObject({
    value: { type: "closed", code: 1013, retryAfterMs: 45_000 },
  });
  await expect(stream.next()).resolves.toMatchObject({ done: true });
  expect(fetch).toHaveBeenCalledOnce();
});
