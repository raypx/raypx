import {
  conversationFeedSelectionSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  type ConversationFeedSelection,
} from "@raypx/contracts/api";
import type { ConversationStream } from "./stream.js";

export function feedSelection(url: string): ConversationFeedSelection | undefined {
  const params = new URL(url).searchParams;
  if ([...params].length !== 3) return undefined;
  const after = params.get("after");
  if (!after || !/^\d{1,16}$/.test(after)) return undefined;
  const result = conversationFeedSelectionSchema.safeParse({
    spaceId: params.get("spaceId"),
    conversationId: params.get("conversationId"),
    after: Number(after),
  });
  return result.success ? result.data : undefined;
}

export function conversationSse(
  request: Request,
  accountId: string,
  selection: ConversationFeedSelection,
  stream: ConversationStream,
): Response {
  const id = crypto.randomUUID();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let closed = false;
  let writing = false;

  function disconnect() {
    clearInterval(heartbeat);
    request.signal.removeEventListener("abort", abort);
    stream.closeFeed(id);
  }
  function abort() {
    closed = true;
    disconnect();
    void writer.abort().catch(() => {});
  }
  async function write(record: string) {
    if (closed) throw new Error("Conversation feed closed");
    const bytes = encoder.encode(record);
    if (bytes.byteLength > MAX_CONVERSATION_FRAME_BYTES + 8)
      throw new Error("Conversation feed frame too large");
    writing = true;
    const timeout = setTimeout(abort, 10_000);
    try {
      await writer.write(bytes);
    } finally {
      clearTimeout(timeout);
      writing = false;
    }
  }
  const heartbeat = setInterval(() => {
    if (!closed && !writing) void write(": heartbeat\n\n").catch(abort);
  }, 5_000);
  request.signal.addEventListener("abort", abort, { once: true });
  void writer.closed.catch(abort);
  if (request.signal.aborted) abort();
  else
    stream.openFeed(id, accountId, request.headers, selection, {
      async write(frame) {
        // Only a heartbeat can be in flight when the feed's serial drain starts a write.
        // Wait for it without starting a second body write.
        if (writing) await writer.ready;
        await write(`data: ${JSON.stringify(frame)}\n\n`);
      },
      close(code, reason) {
        if (closed) return;
        disconnect();
        // Discard a pending frame if admission was revoked while the reader stalled.
        if (writing) {
          abort();
          return;
        }
        const ending =
          code === undefined
            ? Promise.resolve()
            : write(`data: ${JSON.stringify({ type: "closed", code, reason })}\n\n`);
        closed = true;
        void ending.then(() => writer.close()).catch(abort);
      },
    });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
