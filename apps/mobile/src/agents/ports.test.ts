import { describe, expect, it, vi } from "vitest";
import { MAX_CONVERSATION_FRAME_BYTES } from "@raypx/contracts/api";
import {
  conversationDraftKey,
  readConversationDraft,
  writeConversationDraft,
} from "@raypx/agents/model";
import { conversationIdSchema } from "@raypx/core/agents";
import { approvalRequestIdSchema } from "@raypx/core/approvals";
import { spaceIdSchema } from "@raypx/core/spaces";
import {
  deviceDrafts,
  messageKey,
  mobileApi,
  mobileConversationSocket,
  mobileWorkspacePort,
  type NativeEventSocket,
} from "./ports.js";

class EventSocket implements NativeEventSocket {
  private message: ((event: { data: unknown }) => void) | undefined;
  private closed: ((event: { code: number; reason?: string }) => void) | undefined;
  private failed: (() => void) | undefined;
  send = vi.fn<(text: string) => void>();
  close = vi.fn<(code?: number) => void>();

  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(
    type: "close",
    listener: (event: { code: number; reason?: string }) => void,
  ): void;
  addEventListener(type: "error", listener: () => void): void;
  addEventListener(type: string, listener: unknown) {
    if (type === "message") this.message = listener as (event: { data: unknown }) => void;
    if (type === "close")
      this.closed = listener as (event: { code: number; reason?: string }) => void;
    if (type === "error") this.failed = listener as () => void;
  }
  emitMessage(data: unknown) {
    this.message?.({ data });
  }
  emitClose(code: number, reason?: string) {
    this.closed?.({ code, ...(reason ? { reason } : {}) });
  }
  emitError() {
    this.failed?.();
  }
}

function socketHarness(cookie = vi.fn(async () => "session=device-cookie")) {
  const native = new EventSocket();
  const open = vi.fn(() => native);
  const expired = vi.fn();
  const forbidden = vi.fn();
  const callbacks = { onFrame: vi.fn(), onClose: vi.fn(), onError: vi.fn() };
  const socket = mobileConversationSocket({
    origin: "https://api.example.test",
    cookie,
    open,
    expired,
    forbidden,
  }).connect(callbacks);
  return { native, open, expired, forbidden, callbacks, socket };
}

describe("mobile authenticated transports", () => {
  it("forwards a terminal close once and ignores subsequent private frames", async () => {
    const h = socketHarness();
    await Promise.resolve();
    h.native.emitClose(4003, "SPACE_MEMBER_LEFT");
    h.native.emitClose(4003, "SPACE_MEMBER_LEFT");
    h.native.emitMessage(JSON.stringify({ type: "ready", version: 1 }));
    expect(h.callbacks.onClose).toHaveBeenCalledExactlyOnceWith(4003, "SPACE_MEMBER_LEFT");
    expect(h.forbidden).toHaveBeenCalledExactlyOnceWith("SPACE_MEMBER_LEFT");
    expect(h.callbacks.onFrame).not.toHaveBeenCalled();
  });
  it("loads the current cookie for each RPC and keeps credentials in headers", async () => {
    let cookie = "session=first";
    const seen: Request[] = [];
    const expired = vi.fn();
    const client = mobileApi({
      origin: "https://api.example.test",
      cookie: async () => cookie,
      expired,
      fetch: async (input, init) => {
        seen.push(new Request(input, init));
        return Response.json({ json: [] });
      },
    });
    await client.spaces.list({});
    cookie = "session=second";
    await client.spaces.list({});
    expect(seen.map((request) => request.url)).toEqual([
      "https://api.example.test/rpc/spaces/list",
      "https://api.example.test/rpc/spaces/list",
    ]);
    expect(seen.map((request) => request.headers.get("Cookie"))).toEqual([
      "session=first",
      "session=second",
    ]);
    expect(
      seen.every((request) => request.headers.get("Origin") === "https://api.example.test"),
    ).toBe(true);
    expect(
      seen.every((request) => request.method === "POST" && request.credentials === "include"),
    ).toBe(true);
    expect(expired).not.toHaveBeenCalled();
  });

  it("reports RPC session expiry without converting a forbidden response into logout", async () => {
    const expired = vi.fn();
    let status = 403;
    const client = mobileApi({
      origin: "https://api.example.test",
      cookie: async () => "session=current",
      expired,
      fetch: async () => Response.json({ error: { code: "DENIED" } }, { status }),
    });
    await expect(client.spaces.list({})).rejects.toBeInstanceOf(Error);
    expect(expired).not.toHaveBeenCalled();
    status = 401;
    await expect(client.spaces.list({})).rejects.toBeInstanceOf(Error);
    expect(expired).toHaveBeenCalledOnce();
  });

  it("authenticates the native event socket in headers and forwards validated frames", async () => {
    const h = socketHarness();
    await Promise.resolve();
    expect(h.open).toHaveBeenCalledWith("wss://api.example.test/events", {
      Cookie: "session=device-cookie",
      Origin: "https://api.example.test",
    });
    h.native.emitMessage(JSON.stringify({ type: "ready", version: 1 }));
    expect(h.callbacks.onFrame).toHaveBeenCalledWith({ type: "ready", version: 1 });
    const frame = {
      type: "subscribe" as const,
      version: 1 as const,
      spaceId: spaceIdSchema.parse("space"),
      conversationId: conversationIdSchema.parse("conversation"),
      after: 12,
    };
    h.socket.send(frame);
    expect(h.native.send).toHaveBeenCalledWith(JSON.stringify(frame));
    h.socket.close();
  });

  it.each([
    { invalid: { type: "ready", version: 1 } },
    { invalid: "{" },
    { invalid: JSON.stringify({ type: "ready", version: 2 }) },
    { invalid: "中".repeat(Math.ceil(MAX_CONVERSATION_FRAME_BYTES / 3) + 1) },
  ])("rejects non-text, malformed, unsupported or oversized frames", async ({ invalid }) => {
    const h = socketHarness();
    await Promise.resolve();
    h.native.emitMessage(invalid);
    expect(h.callbacks.onFrame).not.toHaveBeenCalled();
    expect(h.native.close).toHaveBeenCalledWith(4000);
    expect(h.callbacks.onError).toHaveBeenCalledOnce();
    h.socket.close();
  });

  it("fences a cookie finishing after local close and all late native callbacks", async () => {
    let finish: (cookie: string) => void = () => {};
    const pending = socketHarness(
      vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    pending.socket.close();
    finish("session=late");
    await Promise.resolve();
    expect(pending.open).not.toHaveBeenCalled();
    expect(pending.callbacks.onFrame).not.toHaveBeenCalled();
    const h = socketHarness();
    await Promise.resolve();
    h.socket.close();
    h.native.emitMessage(JSON.stringify({ type: "ready", version: 1 }));
    h.native.emitClose(4001);
    h.native.emitError();
    expect(h.callbacks.onFrame).not.toHaveBeenCalled();
    expect(h.callbacks.onClose).not.toHaveBeenCalled();
    expect(h.callbacks.onError).not.toHaveBeenCalled();
    expect(h.expired).not.toHaveBeenCalled();
    expect(() =>
      h.socket.send({
        type: "ack",
        version: 1,
        spaceId: spaceIdSchema.parse("space"),
        conversationId: conversationIdSchema.parse("conversation"),
        sequence: 0,
      }),
    ).toThrow("Socket is not open");
  });

  it("separates expired authentication from refreshed Space membership", async () => {
    const expired = socketHarness();
    await Promise.resolve();
    expired.native.emitClose(4001);
    expect(expired.expired).toHaveBeenCalledOnce();
    expect(expired.forbidden).not.toHaveBeenCalled();
    expect(expired.callbacks.onClose).toHaveBeenCalledWith(4001, undefined);
    expired.socket.close();
    const forbidden = socketHarness();
    await Promise.resolve();
    forbidden.native.emitClose(4003);
    expect(forbidden.forbidden).toHaveBeenCalledOnce();
    expect(forbidden.expired).not.toHaveBeenCalled();
    expect(forbidden.callbacks.onClose).toHaveBeenCalledWith(4003, undefined);
    forbidden.socket.close();
    const missing = socketHarness(vi.fn(async () => ""));
    await Promise.resolve();
    expect(missing.open).not.toHaveBeenCalled();
    expect(missing.expired).toHaveBeenCalledOnce();
    expect(missing.callbacks.onClose).toHaveBeenCalledWith(4001);
  });

  it.each(["SPACE_MEMBER_REMOVED", "SPACE_MEMBER_LEFT", "SPACE_DELETING"])(
    "forwards the precise %s native close reason",
    async (reason) => {
      const h = socketHarness();
      await Promise.resolve();
      h.native.emitClose(4003, reason);
      expect(h.forbidden).toHaveBeenCalledWith(reason);
      expect(h.callbacks.onClose).toHaveBeenCalledWith(4003, reason);
      expect(h.expired).not.toHaveBeenCalled();
      h.socket.close();
    },
  );

  it("preserves stable approval errors for the shared projection", async () => {
    const client = mobileApi({
      origin: "https://api.example.test",
      cookie: async () => "session=current",
      expired() {},
      fetch: async () =>
        Response.json(
          {
            json: {
              defined: false,
              code: "CONFLICT",
              message: "Conflict",
              data: { error: { code: "RULE_LIMIT" } },
            },
          },
          { status: 409 },
        ),
    });
    await expect(
      mobileWorkspacePort(client).approvals!.answer({
        spaceId: spaceIdSchema.parse("space"),
        requestId: approvalRequestIdSchema.parse("request"),
        decision: "approved",
        allowTool: true,
      }),
    ).rejects.toThrow("RULE_LIMIT");
  });
});

describe("mobile draft storage", () => {
  it("isolates complete ownership tuples using SecureStore-compatible keys and restores without transport", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const drafts = deviceDrafts(storage);
    const owner = { origin: "https://one.example", accountId: "account" };
    const selection = {
      spaceId: spaceIdSchema.parse("space"),
      conversationId: conversationIdSchema.parse("conversation"),
    };
    const key = conversationDraftKey(owner, selection);
    const draft = {
      text: "Hello 世界",
      pending: { text: "Hello 世界", idempotencyKey: "frozen-receipt" },
    };
    drafts.write(key, writeConversationDraft(draft));
    expect(readConversationDraft(drafts.read(key))).toEqual(draft);
    for (const other of [
      conversationDraftKey({ ...owner, origin: "https://two.example" }, selection),
      conversationDraftKey({ ...owner, accountId: "other" }, selection),
      conversationDraftKey(owner, { ...selection, spaceId: spaceIdSchema.parse("other") }),
      conversationDraftKey(owner, {
        ...selection,
        conversationId: conversationIdSchema.parse("other"),
      }),
    ])
      expect(drafts.read(other)).toBeNull();
    expect([...values.keys()].every((value) => /^[a-zA-Z0-9._-]+$/.test(value))).toBe(true);
    drafts.remove(key);
    expect(readConversationDraft(drafts.read(key))).toEqual({ text: "", pending: null });
  });

  it("creates bounded distinct delivery identities", () => {
    const keys = new Set(Array.from({ length: 100 }, () => messageKey()));
    expect(keys.size).toBe(100);
    expect([...keys].every((key) => key.length > 0 && key.length <= 128)).toBe(true);
  });
});
