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
