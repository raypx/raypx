import {
  conversationFeedCloseSchema,
  conversationFeedFrameSchema,
  MAX_CONVERSATION_FRAME_BYTES,
  type ConversationFeedFrame,
  type ConversationFeedSelection,
} from "@raypx/contracts/api";
import { existingOriginRecovery } from "./origin-recovery.js";

interface FeedClose {
  type: "closed";
  code: number;
  reason: string;
  retryAfterMs?: number | undefined;
}

interface FeedOptions {
  fetch?: (
    input: string,
    init: RequestInit,
  ) => Promise<Pick<Response, "ok" | "status" | "body" | "headers">>;
  headers?: () => Record<string, string> | Promise<Record<string, string>>;
}

function retryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const delay = /^\d+$/.test(value) ? Number(value) * 1_000 : Date.parse(value) - Date.now();
  if (Number.isNaN(delay)) return undefined;
  return Math.min(Math.max(delay, 0), 2_147_483_647);
}

/** The event cursor belongs to the caller. Reading a frame never advances it. */
export async function* readConversationFeed(
  origin: string,
  selection: ConversationFeedSelection,
  { fetch = globalThis.fetch, headers, signal }: FeedOptions & { signal: AbortSignal },
): AsyncGenerator<ConversationFeedFrame | FeedClose> {
  const url = new URL("/api/events", origin);
  url.searchParams.set("spaceId", selection.spaceId);
  url.searchParams.set("conversationId", selection.conversationId);
  url.searchParams.set("after", String(selection.after));
  const requestHeaders = new Headers(await headers?.());
  requestHeaders.set("Accept", "text/event-stream");
  if (signal.aborted) return;
  const transport = existingOriginRecovery(origin)?.fetch ?? fetch;
  const response = await transport(url.toString(), {
    credentials: headers ? "omit" : "include",
    redirect: "error",
    headers: requestHeaders,
    signal,
  });
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    if (response.status === 401) yield { type: "closed", code: 4001, reason: "SESSION_ENDED" };
    else if (response.status === 403) yield { type: "closed", code: 4003, reason: "" };
    else if (response.status === 429 || response.status === 503) {
      const delay = retryAfter(response.headers.get("retry-after"));
      yield {
        type: "closed",
        code: 1013,
        reason: "",
        ...(delay !== undefined && { retryAfterMs: delay }),
      };
    } else throw new Error("Conversation feed unavailable");
    return;
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "text/event-stream" || !response.body) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Invalid conversation feed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  // Frame complete UTF-8 lines before decoding, including on native runtimes.
  const maxLine = MAX_CONVERSATION_FRAME_BYTES + 7;
  let line = new Uint8Array(256);
  let length = 0;
  let data: string | undefined;
  try {
    while (!signal.aborted) {
      const timeout = setTimeout(cancel, 20_000);
      const chunk = await reader.read().finally(() => clearTimeout(timeout));
      if (chunk.done) return;
      const bytes = chunk.value;
      for (let start = 0; start < bytes.length;) {
        if (signal.aborted) return;
        const newline = bytes.indexOf(10, start);
        const end = newline === -1 ? bytes.length : newline;
        const size = length + end - start;
        if (size > maxLine) throw new Error("Conversation feed frame too large");
        if (size > line.length) {
          const expanded = new Uint8Array(Math.min(maxLine, Math.max(size, line.length * 2)));
          expanded.set(line.subarray(0, length));
          line = expanded;
        }
        line.set(bytes.subarray(start, end), length);
        length = size;
        if (newline === -1) break;
        start = newline + 1;
        const lineEnd = length > 0 && line[length - 1] === 13 ? length - 1 : length;
        if (lineEnd > MAX_CONVERSATION_FRAME_BYTES + 6)
          throw new Error("Conversation feed frame too large");
        const record = decoder.decode(line.subarray(0, lineEnd));
        length = 0;
        if (record.startsWith(":")) continue;
        if (record.startsWith("data: ") && data === undefined) {
          data = record.slice(6);
          continue;
        }
        if (record !== "") throw new Error("Invalid conversation feed frame");
        if (data === undefined) continue;
        const json: unknown = JSON.parse(data);
        data = undefined;
        const closed = conversationFeedCloseSchema.safeParse(json);
        if (closed.success) {
          yield closed.data;
          return;
        }
        yield conversationFeedFrameSchema.parse(json);
      }
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

export function createConversationFeed(
  origin: string,
  options: FeedOptions & { onSessionEnded?: () => void } = {},
) {
  return {
    subscribe(
      selection: ConversationFeedSelection,
      callbacks: {
        onFrame(frame: ConversationFeedFrame): void;
        onClose(code?: number, reason?: string, retryAfterMs?: number): void;
        onError(): void;
      },
    ) {
      const scope = new AbortController();
      void (async () => {
        for await (const frame of readConversationFeed(origin, selection, {
          ...options,
          signal: scope.signal,
        })) {
          if (scope.signal.aborted) return;
          if (frame.type === "closed") {
            if (frame.code === 4001) options.onSessionEnded?.();
            if (!scope.signal.aborted)
              callbacks.onClose(frame.code, frame.reason, frame.retryAfterMs);
            return;
          }
          callbacks.onFrame(frame);
        }
        if (!scope.signal.aborted) callbacks.onClose();
      })().catch(() => {
        if (!scope.signal.aborted) callbacks.onError();
      });
      return { close: () => scope.abort() };
    },
  };
}
