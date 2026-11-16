import { expect, it, vi } from "vitest";
import { getWebSocketHooks } from "crossws";
import { conversationFixture } from "../../tests/helpers/conversations.js";
import { ConversationStream } from "./stream.js";
import { createConversationSocketRoutes } from "./socket.js";

it("checks session and Origin before installing hooks and requires a WebSocket upgrade", async () => {
  const f = conversationFixture();
  const stream = new ConversationStream(f);
  const open = vi.spyOn(stream, "open");
  const app = createConversationSocketRoutes({
    stream,
    allowedOrigins: ["https://web.example.test"],
    readSession: f.readSession,
  });
  const trusted = new Request("https://api.example.test/", {
    headers: { upgrade: "websocket", origin: "https://web.example.test" },
  });
  expect((await app.fetch(trusted)).status).toBe(426);
  expect(getWebSocketHooks(trusted)?.open).toBeTypeOf("function");
  for (const [request, expected] of [
    [
      new Request("https://api.example.test/", {
        headers: { upgrade: "websocket", origin: "https://evil.example.test" },
      }),
      403,
    ],
    [
      new Request("https://api.example.test/", {
        method: "POST",
        headers: { upgrade: "websocket" },
      }),
      404,
    ],
  ] as const)
    expect((await app.fetch(request)).status).toBe(expected);
  f.signOut();
  const unsigned = new Request("https://api.example.test/", { headers: { upgrade: "websocket" } });
  expect((await app.fetch(unsigned)).status).toBe(401);
  expect(open).not.toHaveBeenCalled();
});

it("admits only a session-authorized, bounded SSE cursor on the same endpoint", async () => {
  const f = conversationFixture();
  const stream = new ConversationStream(f);
  const open = vi.spyOn(stream, "openFeed");
  const app = createConversationSocketRoutes({
    stream,
    allowedOrigins: ["https://web.example.test"],
    readSession: f.readSession,
  });
  const url = new URL("https://api.example.test/");
  url.search = new URLSearchParams({
    spaceId: f.spaceId,
    conversationId: f.conversationId,
    after: "-1",
  }).toString();
  const accept = "text/event-stream";
  expect((await app.request(url.toString(), { headers: { accept } })).status).toBe(400);
  url.searchParams.set("after", "0");
  expect(
    (
      await app.request(url.toString(), {
        headers: { accept, origin: "https://evil.example.test" },
      })
    ).status,
  ).toBe(403);
  expect(open).not.toHaveBeenCalled();
  const response = await app.request(url.toString(), { headers: { accept } });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  expect(response.headers.get("cache-control")).toContain("no-store");
  const reader = response.body!.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('"type":"ready"');
  const id = open.mock.calls[0]![0];
  const close = vi.spyOn(stream, "closeFeed");
  await reader.cancel();
  await expect.poll(() => close.mock.calls).toContainEqual([id]);
  f.signOut();
  expect((await app.request(url.toString(), { headers: { accept } })).status).toBe(401);
});
