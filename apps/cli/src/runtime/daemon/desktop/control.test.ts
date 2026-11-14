import { expect, it, vi } from "vitest";
import type { LocalMethod } from "@raypx/contracts/local";
import { DesktopApi } from "./api.js";
import { DesktopControl } from "./control.js";
import { parseSessionCookie, SessionCookies } from "./cookies.js";
import type { EventsSocketFactory } from "./events.js";

const origin = "https://api.example.test";
const profile = { id: "owner", name: "Owner", email: "owner@example.test" };
const signal = () => new AbortController().signal;
const host = () => ({
  request: vi.fn(
    async (_method: LocalMethod, _params: unknown, _client?: string, scope?: AbortSignal) => {
      scope?.throwIfAborted();
      return { version: "test", protocolVersion: 1 as const, owner: "daemon" as const };
    },
  ),
});

function eventsFixture(
  fetch: (request: Request) => Promise<Response> = async () => Response.json({ json: profile }),
) {
  const cookies = new SessionCookies(origin);
  cookies.apply([
    parseSessionCookie(
      cookies.origin,
      "__Secure-better-auth.session_token=private; Secure; HttpOnly; Path=/",
    )!,
  ]);
  const sockets: Array<{
    receive(value: unknown): void;
    close: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
  }> = [];
  const connect = vi.fn<EventsSocketFactory>((_url, _headers, receive) => {
    const socket = { receive, close: vi.fn(), send: vi.fn() };
    sockets.push(socket);
    return socket;
  });
  const api = new DesktopApi(cookies, fetch, connect);
  const owner = host();
  const control = new DesktopControl(api, owner);
  return { control, api, owner, sockets, connect };
}

it("opens conversation events only after verifying the requested account through the private session", async () => {
  const fetch = vi.fn(async (_request: Request) => Response.json({ json: profile }));
  const f = eventsFixture(fetch);
  const id = crypto.randomUUID();
  try {
    await expect(
      f.control.request("events_open", { id, accountId: "other" }, "page", signal()),
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(f.connect).not.toHaveBeenCalled();
    await expect(
      f.control.request("events_open", { id, accountId: "owner" }, "page", signal()),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [request] of fetch.mock.calls) expect(request.url).toBe(`${origin}/rpc/account/get`);
    expect(f.connect.mock.calls[0]![1]).toEqual({
      cookie: "__Secure-better-auth.session_token=private",
      origin: "views://main",
    });
    expect(f.owner.request).not.toHaveBeenCalled();
  } finally {
    f.control.close();
  }
});

it("isolates event read, send and close by the authenticated renderer client", async () => {
  const f = eventsFixture();
  const id = crypto.randomUUID();
  try {
    await f.control.request("events_open", { id, accountId: "owner" }, "first", signal());
    await expect(
      f.control.request("events_read", { id }, "second", signal()),
    ).rejects.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
    await expect(
      f.control.request(
        "events_send",
        {
          id,
          frame: {
            type: "subscribe",
            version: 1,
            spaceId: "space",
            conversationId: "conversation",
            after: 4,
          },
        },
        "second",
        signal(),
      ),
    ).rejects.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
    await f.control.request("events_close", { id }, "second", signal());
    expect(f.sockets[0]!.close).not.toHaveBeenCalled();
    f.sockets[0]!.receive(JSON.stringify({ type: "ready", version: 1 }));
    await expect(f.control.request("events_read", { id }, "first", signal())).resolves.toEqual({
      type: "ready",
      version: 1,
    });
    await f.control.request("events_close", { id }, "first", signal());
    expect(f.sockets[0]!.close).toHaveBeenCalledOnce();
    expect(f.api.idle).toBe(true);
  } finally {
    f.control.close();
  }
});

it("closes conversation sockets and waiting reads when account selection or logout replaces the session", async () => {
  const f = eventsFixture();
  try {
    const id = crypto.randomUUID();
    await f.control.request("events_open", { id, accountId: "owner" }, "page", signal());
    const pending = f.control.request("events_read", { id }, "page", signal());
    const rejected = pending.catch((error: unknown) => error);
    await f.control.select("owner", "page", signal());
    await expect(rejected).resolves.toMatchObject({ code: "EVENTS_UNAVAILABLE" });
    expect(f.sockets[0]!.close).toHaveBeenCalledOnce();
    await f.control.request("events_open", { id, accountId: "owner" }, "page", signal());
    await f.control.request(
      "api_fetch",
      {
        path: "/api/auth/sign-out",
        method: "POST",
        headers: {},
        body: "{}",
      },
      "page",
      signal(),
    );
    expect(f.sockets[1]!.close).toHaveBeenCalledOnce();
    expect(f.api.idle).toBe(true);
  } finally {
    f.control.close();
  }
});

it("cannot open an events socket after logout wins an in-flight account verification", async () => {
  let complete!: (response: Response) => void;
  const f = eventsFixture(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = f.control.request(
    "events_open",
    {
      id: crypto.randomUUID(),
      accountId: "owner",
    },
    "page",
    signal(),
  );
  const rejected = pending.catch((error: unknown) => error);
  try {
    await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
    await f.control.select(null, "logout", signal());
    await expect(rejected).resolves.toMatchObject({ code: "CANCELLED" });
    complete(Response.json({ json: profile }));
    await Promise.resolve();
    expect(f.connect).not.toHaveBeenCalled();
    expect(f.api.idle).toBe(true);
  } finally {
    f.control.close();
  }
});

it("aborts stale verification when a later logout replaces its account selection", async () => {
  let complete!: (response: Response) => void;
  const owner = host();
  const api = new DesktopApi(
    new SessionCookies(origin),
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const control = new DesktopControl(api, owner);
  const pending = control.select("owner", "page", signal());
  const rejected = pending.catch((error: unknown) => error);
  await control.select(null, "logout", signal());
  expect(await rejected).toMatchObject({ code: "CANCELLED" });
  complete(Response.json({ json: profile }));
  await Promise.resolve();
  expect(owner.request).not.toHaveBeenCalled();
});

it("cancels previous HTTP work before an auth mutation so a late sign-in cannot overwrite logout", async () => {
  let complete!: (response: Response) => void;
  const owner = host();
  const jar = new SessionCookies(origin);
  const api = new DesktopApi(jar, (request) => {
    if (request.url.endsWith("/sign-in/email"))
      return new Promise((resolve) => {
        complete = resolve;
      });
    return Promise.resolve(Response.json({ success: true }));
  });
  const control = new DesktopControl(api, owner);
  const pending = control.request(
    "api_fetch",
    { path: "/api/auth/sign-in/email", method: "POST", headers: {}, body: "{}" },
    "page",
    signal(),
  );
  const rejected = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(complete).toBeTypeOf("function"));
  await control.request(
    "api_fetch",
    { path: "/api/auth/sign-out", method: "POST", headers: {}, body: "{}" },
    "page",
    signal(),
  );
  expect(await rejected).toMatchObject({ code: "CANCELLED" });
  complete(
    Response.json(
      {},
      {
        headers: {
          "set-cookie": "__Secure-better-auth.session_token=stale; Secure; HttpOnly; Max-Age=60",
        },
      },
    ),
  );
  await Promise.resolve();
  expect(jar.header(new URL(origin))).toBe("");
});

it("keeps device grant polling native-only and verifies cookies without retained enrollment or selection", async () => {
  let authenticated = true;
  const fetch = vi.fn(async (_request: Request) =>
    authenticated ? Response.json({ json: profile }) : new Response(null, { status: 401 }),
  );
  const f = eventsFixture(fetch);
  try {
    expect(await f.control.nativeIdentity(signal())).toEqual({
      accountId: "owner",
      serverOrigin: origin,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.owner.request).not.toHaveBeenCalled();
    await expect(
      f.control.request("device_connector_context", {}, "page", signal()),
    ).rejects.toMatchObject({ code: "METHOD_NOT_PERMITTED" });
    authenticated = false;
    expect(await f.control.nativeIdentity(signal())).toBeNull();
  } finally {
    f.control.close();
  }
});

it("resolves a replaced cookie account without granting retained Host authority", async () => {
  let returned = profile;
  const f = eventsFixture(async () => Response.json({ json: returned }));
  try {
    expect(await f.control.nativeIdentity(signal())).toEqual({
      accountId: "owner",
      serverOrigin: origin,
    });
    returned = { ...profile, id: "other" };
    expect(await f.control.nativeIdentity(signal())).toEqual({
      accountId: "other",
      serverOrigin: origin,
    });
    expect(f.owner.request).not.toHaveBeenCalled();
  } finally {
    f.control.close();
  }
});
