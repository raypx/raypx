import {
  conversationServerFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  type ConversationClientFrame,
  type ConversationServerFrame,
} from "@raypx/contracts/api";
import type { DesktopEventsClose, DesktopEventsRead } from "@raypx/contracts/desktop";
import { LocalError } from "../../errors.js";
import type { SessionCookies } from "./cookies.js";

interface EventsSocket {
  send(text: string): void;
  close(): void;
}
export type EventsSocketFactory = (
  url: URL,
  headers: Record<string, string>,
  receive: (data: unknown) => void,
  closed: (code?: number, reason?: string) => void,
) => EventsSocket;

const unavailable = () => new LocalError("EVENTS_UNAVAILABLE", "Conversation stream unavailable");
const queueLimit = 1024 * 1024;
// Remote diagnostics are not renderer copy. Forward only the stable public endings,
// paired with their expected code, after validating the WebSocket UTF-8 byte budget.
function closeResult(code = 1006, reason = ""): DesktopEventsClose {
  const validCode = Number.isInteger(code) && code >= 1000 && code <= 4999;
  const validReason =
    typeof reason === "string" &&
    reason.length <= 123 &&
    Buffer.byteLength(reason, "utf8") <= 123 &&
    Buffer.from(reason, "utf8").toString("utf8") === reason;
  const knownReason =
    (code === 4001 && reason === "SESSION_ENDED") ||
    (code === 4003 &&
      ["SPACE_MEMBER_REMOVED", "SPACE_MEMBER_LEFT", "SPACE_DELETING"].includes(reason));
  return {
    type: "closed",
    code: validCode ? code : 1006,
    reason: validReason && knownReason ? reason : "",
  };
}
const socketFactory: EventsSocketFactory = (url, headers, receive, closed) => {
  const socket = new WebSocket(url, { headers });
  socket.addEventListener("message", ({ data }) => receive(data));
  socket.addEventListener("close", ({ code, reason }) => closed(code, reason));
  socket.addEventListener("error", () => closed());
  return socket;
};
interface Stream {
  scope: AbortController;
  socket?: EventsSocket;
  queue: { frame: ConversationServerFrame; bytes: number }[];
  bytes: number;
  closed?: DesktopEventsClose;
  expiry?: ReturnType<typeof setTimeout>;
  waiter?: { resolve(frame: Exclude<DesktopEventsRead, null>): void; reject(): void };
}

/** A bounded private bridge to /events. Only the renderer applies and ACKs events. */
export class DesktopEvents {
  private readonly streams = new Map<string, Stream>();
  constructor(
    private readonly cookies: SessionCookies,
    private readonly connect: EventsSocketFactory = socketFactory,
  ) {}
  get idle() {
    return this.streams.size === 0;
  }
  private key(client: string, id: string) {
    return `${client}:${id}`;
  }
  open(client: string, id: string, parent: AbortSignal): true {
    parent.throwIfAborted();
    this.cookies.assertAvailable();
    const key = this.key(client, id);
    if (this.streams.size >= 8 || this.streams.has(key)) throw unavailable();
    const resource = new URL("/events", this.cookies.origin);
    const cookie = this.cookies.header(resource);
    if (!cookie) throw new LocalError("AUTH_REQUIRED", "AUTH_REQUIRED");
    const stream: Stream = { scope: new AbortController(), queue: [], bytes: 0 };
    this.streams.set(key, stream);
    const close = () => {
      if (this.streams.get(key) === stream) this.close(client, id);
    };
    parent.addEventListener("abort", close, { once: true });
    stream.scope.signal.addEventListener(
      "abort",
      () => {
        parent.removeEventListener("abort", close);
        clearTimeout(stream.expiry);
        stream.queue.length = 0;
        stream.bytes = 0;
        stream.socket?.close();
        stream.waiter?.reject();
      },
      { once: true },
    );
    const receive = (data: unknown) => {
      if (stream.scope.signal.aborted || stream.closed) return;
      try {
        if (typeof data !== "string") throw unavailable();
        const bytes = Buffer.byteLength(data);
        if (bytes > MAX_CONVERSATION_FRAME_BYTES) throw unavailable();
        const frame = conversationServerFrameSchema.parse(JSON.parse(data));
        if (stream.waiter) {
          stream.waiter.resolve(frame);
          return;
        }
        if (stream.queue.length >= 64 || stream.bytes + bytes > queueLimit) throw unavailable();
        stream.queue.push({ frame, bytes });
        stream.bytes += bytes;
      } catch {
        close();
      }
    };
    const ended = (code?: number, reason?: string) => {
      if (this.streams.get(key) !== stream || stream.closed) return;
      stream.closed = closeResult(code, reason);
      // Admission may have ended: discard unread content before delivering closure.
      stream.queue.length = 0;
      stream.bytes = 0;
      const socket = stream.socket;
      delete stream.socket;
      socket?.close();
      if (stream.waiter) {
        stream.waiter.resolve(stream.closed);
        close();
        return;
      }
      // Retain one terminal result between long polls, within the eight-stream bound.
      stream.expiry = setTimeout(close, 20_000);
    };
    resource.protocol = resource.protocol === "https:" ? "wss:" : "ws:";
    try {
      stream.socket = this.connect(resource, { cookie, origin: "views://main" }, receive, ended);
      if (stream.scope.signal.aborted || stream.closed) {
        stream.socket.close();
        delete stream.socket;
      }
    } catch {
      close();
      throw unavailable();
    }
    return true;
  }
  private get(client: string, id: string) {
    const stream = this.streams.get(this.key(client, id));
    if (!stream || stream.scope.signal.aborted) throw unavailable();
    return stream;
  }
  send(client: string, id: string, frame: ConversationClientFrame): true {
    const stream = this.get(client, id);
    if (stream.closed) throw unavailable();
    try {
      stream.socket!.send(JSON.stringify(frame));
    } catch {
      this.close(client, id);
      throw unavailable();
    }
    return true;
  }
  async read(client: string, id: string, signal: AbortSignal): Promise<DesktopEventsRead> {
    signal.throwIfAborted();
    const stream = this.get(client, id);
    if (stream.waiter) throw unavailable();
    if (stream.closed) {
      const result = stream.closed;
      this.close(client, id);
      return result;
    }
    const next = stream.queue.shift();
    if (next) {
      stream.bytes -= next.bytes;
      return next.frame;
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", cancelled);
        delete stream.waiter;
      };
      const cancelled = () => {
        cleanup();
        reject(unavailable());
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, 20_000);
      stream.waiter = {
        resolve(frame) {
          cleanup();
          resolve(frame);
        },
        reject: cancelled,
      };
      signal.addEventListener("abort", cancelled, { once: true });
      if (signal.aborted || stream.scope.signal.aborted) cancelled();
    });
  }
  close(client: string, id: string): true {
    const key = this.key(client, id);
    const stream = this.streams.get(key);
    this.streams.delete(key);
    stream?.scope.abort();
    return true;
  }
  closeAll() {
    const streams = [...this.streams.values()];
    this.streams.clear();
    for (const stream of streams) stream.scope.abort();
  }
}
