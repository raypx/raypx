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
  let closed!: () => void;
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
    closed: () => closed(),
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
  await expect(f.events.read("page", f.id, signal())).rejects.toThrow(
    "Conversation stream unavailable",
  );
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
  firstClosed();
  f.receive({ type: "ready", version: 1 });
  await expect(f.events.read("page", f.id, signal())).resolves.toEqual({
    type: "ready",
    version: 1,
  });
  expect(f.events.idle).toBe(false);
  f.closed();
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

it("releases capacity after a synchronously closed or failed connection", () => {
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
  for (let index = 0; index < 9; index++) events.open("page", crypto.randomUUID(), signal());
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
