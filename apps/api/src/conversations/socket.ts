import { setWebSocketHooks, type Hooks } from "crossws";
import { Hono } from "hono";
import { MAX_CONVERSATION_FRAME_BYTES, MAX_SCREEN_STREAM_FRAME_BYTES } from "@raypx/contracts/api";
import type { AuthSession } from "@raypx/core/auth";
import type { ConversationStream } from "./stream.js";

export function createConversationSocketRoutes(options: {
  stream: ConversationStream;
  allowedOrigins: string[];
  readSession(headers: Headers): Promise<AuthSession | null>;
}) {
  return new Hono().all("/", async (c) => {
    const request = c.req.raw;
    const origin = request.headers.get("origin");
    const auth = await options.readSession(request.headers);
    let status: 401 | 403 | 404 | 426 = 426;
    if (request.method !== "GET") status = 404;
    else if (origin && !options.allowedOrigins.includes(origin)) status = 403;
    else if (!auth || auth.session.expiresAt.getTime() <= Date.now()) status = 401;
    const response = c.json({ error: status === 426 ? "UPGRADE_REQUIRED" : "UNAVAILABLE" }, status);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return response;
    if (status !== 426 || !auth) {
      setWebSocketHooks(request, { upgrade: () => response });
      return response;
    }
    const hooks: Partial<Hooks> = {
      open(peer) {
        options.stream.open(peer.id, auth.user.id, request.headers, {
          send(frame) {
            if (
              peer.bufferedAmount >
                (frame.type === "screen.event"
                  ? MAX_SCREEN_STREAM_FRAME_BYTES
                  : MAX_CONVERSATION_FRAME_BYTES) ||
              peer.send(JSON.stringify(frame)) === 0
            )
              throw new Error("Stream backpressure");
          },
          close: (code, reason) => peer.close(code, reason),
        });
      },
      message(peer, message) {
        if (typeof message.rawData !== "string") {
          peer.close(4000, "Invalid frame");
          return;
        }
        options.stream.receive(peer.id, message.rawData);
      },
      close(peer) {
        options.stream.close(peer.id);
      },
    };
    setWebSocketHooks(request, hooks);
    return response;
  });
}
