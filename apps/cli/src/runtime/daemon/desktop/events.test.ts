import { expect, it, vi } from "vitest";
import { DesktopEvents, type EventsSocketFactory } from "./events.js";
import { parseSessionCookie, SessionCookies } from "./cookies.js";

function fixture() {
  const cookies = new SessionCookies("https://api.example.test");
  cookies.apply([
    parseSessionCookie(
      cookies.origin,
      "__Secure-better-auth.session_token=private; Secure; HttpOnly; Path=/",
    )!,
  ]);
  const sent: string[] = [];
  const close = vi.fn();
  let receive!: (value: unknown) => void;
  let closed!: Parameters<EventsSocketFactory>[3];
  const connect = vi.fn<EventsSocketFactory>((_url, _headers, onFrame, onClose) => {
    receive = onFrame;
    closed = onClose;
    return {
      send: (text) => {
        sent.push(text);
      },
      close,
    };
  });
  const events = new DesktopEvents(cookies, connect);
  const scope = new AbortController();
  const id = crypto.randomUUID();
  events.open("page", id, scope.signal);
  return {
    events,
    id,
    connect,
    receive: (frame: unknown) => receive(JSON.stringify(frame)),
    closed: (code?: number, reason?: string) => closed(code, reason),
    sent,
    close,
    scope,
  };
}
const signal = () => new AbortController().signal;

it("opens only the selected-origin stream with private session headers, and never ACKs for the renderer", async () => {
  const f = fixture();
  expect(f.connect.mock.calls[0]![0].href).toBe("wss://api.example.test/events");
  expect(f.connect.mock.calls[0]![1]).toEqual({
    cookie: "__Secure-better-auth.session_token=private",
    origin: "views://main",
  });
  f.receive({ type: "ready", version: 1 });
  expect(await f.events.read("page", f.id, signal())).toEqual({ type: "ready", version: 1 });
  expect(f.sent).toEqual([]);
  f.events.closeAll();
});

it("isolates pages and forwards explicit subscribe/ACK frames without changing their cursor", async () => {
  const f = fixture();
  await expect(f.events.read("another-page", f.id, signal())).rejects.toMatchObject({
    code: "EVENTS_UNAVAILABLE",
  });
  const frame = {
    type: "subscribe",
    version: 1,
    spaceId: "space",
    conversationId: "conversation",
    after: 7,
  } as const;
  // Transport values have already been parsed by DesktopControl's contract boundary.
  f.events.send("page", f.id, frame as Parameters<DesktopEvents["send"]>[2]);
  expect(f.sent.map((value) => JSON.parse(value))).toEqual([frame]);
  f.events.closeAll();
});

it("releases waiting reads and its socket when the page or session ends", async () => {
  const f = fixture();
  const pending = f.events.read("page", f.id, signal());
  const rejected = pending.catch((error: unknown) => error);
  f.scope.abort();
  await expect(rejected).resolves.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.events.idle).toBe(true);
});

it("rejects duplicate readers and unsafe or overflowing remote frames", async () => {
  const f = fixture();
  const waiting = f.events.read("page", f.id, signal());
  const rejected = waiting.catch((error: unknown) => error);
  await expect(f.events.read("page", f.id, signal())).rejects.toMatchObject({
    code: "EVENTS_UNAVAILABLE",
  });
  f.receive({ type: "ready", version: 2 });
  await expect(rejected).resolves.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
  expect(f.close).toHaveBeenCalledOnce();
  const overflow = fixture();
  for (let index = 0; index < 65; index++) overflow.receive({ type: "ready", version: 1 });
  expect(overflow.close).toHaveBeenCalledOnce();
  expect(overflow.events.idle).toBe(true);
});

it("delivers to a waiting reader, then reports remote closure without leaking diagnostics", async () => {
  const f = fixture();
  const pending = f.events.read("page", f.id, signal());
  f.receive({ type: "ready", version: 1 });
  expect(await pending).toEqual({ type: "ready", version: 1 });
  f.closed();
  await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
    type: "closed",
    code: 1006,
    reason: "",
  });
  expect(f.events.idle).toBe(true);
});

it("requires a usable session before connecting", () => {
  const connect = vi.fn<EventsSocketFactory>();
  const events = new DesktopEvents(new SessionCookies("https://api.example.test"), connect);
  expect(() => events.open("page", crypto.randomUUID(), signal())).toThrow("AUTH_REQUIRED");
  expect(connect).not.toHaveBeenCalled();
});

it("ignores a late close callback from an earlier socket after the renderer reuses its ID", async () => {
  const f = fixture();
  // Capture the first callback before replacing the factory's current callback.
  const firstClosed = f.connect.mock.calls[0]![3];
  f.events.close("page", f.id);
  f.events.open("page", f.id, signal());
  firstClosed(4001, "SESSION_ENDED");
  f.receive({ type: "ready", version: 1 });
  await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
    type: "ready",
    version: 1,
  });
  expect(f.events.idle).toBe(false);
  f.closed();
  await f.events.read("page", f.id, signal());
  expect(f.events.idle).toBe(true);
});

it("removes cancelled readers and long-poll timers without closing a healthy socket", async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const caller = new AbortController();
    const pending = f.events.read("page", f.id, caller.signal);
    const rejected = pending.catch((error: unknown) => error);
    caller.abort();
    await expect(rejected).resolves.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
    expect(vi.getTimerCount()).toBe(0);
    expect(f.close).not.toHaveBeenCalled();
    const next = f.events.read("page", f.id, signal());
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(next).resolves.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    f.receive({ type: "ready", version: 1 });
    await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
      type: "ready",
      version: 1,
    });
  } finally {
    f.events.closeAll();
    vi.useRealTimers();
  }
});

it("bounds queued UTF-8 bytes separately from frame count", () => {
  const f = fixture();
  const frame = {
    type: "reply.prefix",
    spaceId: "space",
    conversationId: "conversation",
    runId: "run",
    segmentId: "segment",
    offset: 0,
    text: "你".repeat(32_000),
  };
  for (let index = 0; index < 11; index++) f.receive(frame);
  expect(f.events.idle).toBe(true);
  expect(f.close).toHaveBeenCalledOnce();
});

it("releases capacity after reading a synchronous close or a failed connection", async () => {
  const cookies = new SessionCookies("https://api.example.test");
  cookies.apply([
    parseSessionCookie(
      cookies.origin,
      "__Secure-better-auth.session_token=private; Secure; HttpOnly; Path=/",
    )!,
  ]);
  const close = vi.fn();
  const connect = vi.fn<EventsSocketFactory>((_url, _headers, _receive, closed) => {
    closed();
    return { send: vi.fn(), close };
  });
  const events = new DesktopEvents(cookies, connect);
  for (let index = 0; index < 9; index++) {
    const id = crypto.randomUUID();
    events.open("page", id, signal());
    await expect(events.read("page", id, signal())).resolves.toEqual({
      type: "closed",
      code: 1006,
      reason: "",
    });
  }
  expect(events.idle).toBe(true);
  expect(close).toHaveBeenCalledTimes(9);
  connect.mockImplementationOnce(() => {
    throw new Error("private endpoint credential");
  });
  expect(() => events.open("page", crypto.randomUUID(), signal())).toThrow(
    "Conversation stream unavailable",
  );
  expect(events.idle).toBe(true);
});

const endings = [
  [4003, "SPACE_MEMBER_REMOVED"],
  [4003, "SPACE_MEMBER_LEFT"],
  [4003, "SPACE_DELETING"],
  [4001, "SESSION_ENDED"],
] as const;

it.each(endings)("delivers %i/%s once to a waiting reader", async (code, reason) => {
  const f = fixture();
  const pending = f.events.read("page", f.id, signal());
  f.closed(code, reason);
  f.closed(1006, "private diagnostics");
  await expect(pending).resolves.toEqual({ type: "closed", code, reason });
  await expect(f.events.read("page", f.id, signal())).rejects.toMatchObject({
    code: "EVENTS_UNAVAILABLE",
  });
  expect(f.close).toHaveBeenCalledOnce();
  expect(f.events.idle).toBe(true);
});

it.each(endings)(
  "retains %i/%s between polls and discards queued content",
  async (code, reason) => {
    const f = fixture();
    f.receive({ type: "ready", version: 1 });
    f.closed(code, reason);
    f.receive({ type: "ready", version: 1 });
    await expect(f.events.read("other-page", f.id, signal())).rejects.toMatchObject({
      code: "EVENTS_UNAVAILABLE",
    });
    expect(() => f.events.send("page", f.id, {} as Parameters<DesktopEvents["send"]>[2])).toThrow(
      "Conversation stream unavailable",
    );
    await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
      type: "closed",
      code,
      reason,
    });
    expect(f.events.idle).toBe(true);
  },
);

it.each([
  [4003, "x".repeat(124), 4003],
  [4003, "你".repeat(42), 4003],
  [4003, "\ud800", 4003],
  [4003, "\udc00", 4003],
  [4003, "private diagnostic", 4003],
  [4003, "SESSION_ENDED", 4003],
  [4001, "SPACE_MEMBER_LEFT", 4001],
  [4999, "SPACE_MEMBER_REMOVED", 4999],
  [1006, "private diagnostic", 1006],
  [Number.NaN, "SPACE_MEMBER_LEFT", 1006],
  [5000, "SPACE_MEMBER_LEFT", 1006],
  [4003.5, "SPACE_MEMBER_LEFT", 1006],
])("sanitizes unsupported close metadata (case %#)", async (code, reason, expectedCode) => {
  const f = fixture();
  f.closed(code, reason);
  await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
    type: "closed",
    code: expectedCode,
    reason: "",
  });
});

it("bounds unread terminal results and expires their parent listeners and capacity", async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    f.closed(4003, "SPACE_MEMBER_LEFT");
    for (let index = 1; index < 8; index++) {
      f.events.open("page", crypto.randomUUID(), f.scope.signal);
      f.closed(4003, "SPACE_MEMBER_LEFT");
    }
    expect(() => f.events.open("page", crypto.randomUUID(), signal())).toThrow(
      "Conversation stream unavailable",
    );
    expect(vi.getTimerCount()).toBe(8);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.events.idle).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    f.events.open("page", f.id, signal());
  } finally {
    f.events.closeAll();
    vi.useRealTimers();
  }
});

it("drops retained endings when the page or session is replaced", async () => {
  const f = fixture();
  f.closed(4003, "SPACE_MEMBER_LEFT");
  f.scope.abort();
  expect(f.events.idle).toBe(true);
  await expect(f.events.read("page", f.id, signal())).rejects.toMatchObject({
    code: "EVENTS_UNAVAILABLE",
  });
  f.events.open("page", f.id, signal());
  f.closed(4001, "SESSION_ENDED");
  f.events.closeAll();
  expect(f.events.idle).toBe(true);
});

it.each([...endings, [1006, ""] as const])(
  "extracts %i/%s from the remote WebSocket event",
  async (code, reason) => {
    const sockets: EventTarget[] = [];
    class Socket extends EventTarget {
      constructor() {
        super();
        sockets.push(this);
      }
      close() {}
    }
    vi.stubGlobal("WebSocket", Socket);
    const cookies = new SessionCookies("https://api.example.test");
    cookies.apply([
      parseSessionCookie(
        cookies.origin,
        "__Secure-better-auth.session_token=private; Secure; HttpOnly; Path=/",
      )!,
    ]);
    const events = new DesktopEvents(cookies);
    const id = crypto.randomUUID();
    try {
      events.open("page", id, signal());
      const pending = events.read("page", id, signal());
      const event = code === 1006 ? new Event("error") : new Event("close");
      sockets[0]!.dispatchEvent(
        Object.assign(event, { code, reason, message: "private diagnostic" }),
      );
      await expect(pending).resolves.toEqual({ type: "closed", code, reason });
    } finally {
      events.closeAll();
      vi.unstubAllGlobals();
    }
  },
);
