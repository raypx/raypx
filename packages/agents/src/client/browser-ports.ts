import {
  conversationServerFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  MAX_SCREEN_STREAM_FRAME_BYTES,
} from "@raypx/contracts/api";
import type { ConversationDraftStore, ConversationSocketPort } from "../model.js";

export function browserConversationSocket(origin: string): ConversationSocketPort {
  return {
    connect(callbacks) {
      const url = new URL("/events", origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(url);
      socket.addEventListener("message", (event: MessageEvent<unknown>) => {
        try {
          if (
            typeof event.data !== "string" ||
            new TextEncoder().encode(event.data).byteLength > MAX_SCREEN_STREAM_FRAME_BYTES
          )
            throw new Error("Invalid conversation frame");
          const frame = conversationServerFrameSchema.parse(JSON.parse(event.data));
          if (
            frame.type !== "screen.event" &&
            new TextEncoder().encode(event.data).byteLength > MAX_CONVERSATION_FRAME_BYTES
          )
            throw new Error("Invalid conversation frame");
          callbacks.onFrame(frame);
        } catch {
          callbacks.onError();
          socket.close(4000);
        }
      });
      socket.addEventListener("close", (event) => callbacks.onClose(event.code, event.reason));
      socket.addEventListener("error", () => callbacks.onError());
      return {
        send: (frame) => socket.send(JSON.stringify(frame)),
        close: () => socket.close(),
      };
    },
  };
}

/** Access is deferred until mount so server rendering never reads device storage. */
export function browserConversationDrafts(): ConversationDraftStore {
  return {
    read: (key) => localStorage.getItem(key),
    write: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  };
}
