import { expect, it, vi } from "vitest";
import type { LocalMethod } from "@raypx/contracts/local";
import { DesktopApi } from "./api.js";
import { DesktopControl } from "./control.js";
import { parseSessionCookie, SessionCookies } from "./cookies.js";
import type { EventsSocketFactory } from "./events.js";

const origin = "https://api.example.test";
const profile = { id: "owner", name: "Owner", email: "owner@example.test" };
const signal = () => new AbortController().signal;
const info = {
  installationId: crypto.randomUUID(),
  name: "Desktop",
  enabled: true,
  connected: false,
  pendingRevoke: null,
  binding: null,
  error: null,
};
const host = () => ({
  request: vi.fn(
    async (
      _method: LocalMethod,
      _params: unknown,
      _client: string,
      scope: AbortSignal,
    ): Promise<unknown> => {
      scope.throwIfAborted();
      return info;
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
  const control = new DesktopControl(api, owner, undefined);
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

it("verifies the account with its own session and preserves same-account daemon work on page recovery", async () => {
  const owner = host();
  const api = new DesktopApi(new SessionCookies(origin), async () =>
    Response.json({ json: profile }),
  );
  const control = new DesktopControl(api, owner, undefined);
  await control.select("owner", "first", signal());
  await control.select("owner", "replacement", signal());
  expect(owner.request.mock.calls.map(([method, params]) => [method, params])).toEqual([
    ["host.session", { accountId: "owner", apiUrl: origin }],
    ["host.session", { accountId: "owner", apiUrl: origin }],
  ]);
  await expect(control.select("other", "page", signal())).rejects.toThrow("AUTH_REQUIRED");
  expect(owner.request.mock.calls.at(-1)![1]).toEqual({ accountId: null, apiUrl: origin });
});

it("revokes a credential issued during disconnect before it can bind the host", async () => {
  const owner = host();
  let authorization!: (response: Response) => void;
  const fetch = vi.fn(async (request: Request): Promise<Response> => {
    if (request.url.endsWith("/hosts/authorize"))
      return new Promise((resolve) => {
        authorization = resolve;
      });
    if (request.url.endsWith("/hosts/revoke")) return Response.json({ json: { revoked: true } });
    return Response.json({ json: profile });
  });
  const api = new DesktopApi(new SessionCookies(origin), fetch);
  const control = new DesktopControl(api, owner, undefined);
  const page = new AbortController();
  const deviceId = crypto.randomUUID(),
    expiresAt = new Date(Date.now() + 60_000).toISOString();
  const pending = control.request(
    "control_attach",
    {
      accountId: "owner",
      apiUrl: origin,
      grant: { deviceId, epoch: 1, token: "renderer-grant", expiresAt },
    },
    "page",
    page.signal,
  );
  const rejected = pending.catch((error: unknown) => error);
  await vi.waitFor(() => expect(authorization).toBeTypeOf("function"));
  page.abort();
  await control.select(null, "logout", signal());
  const credential = "a".repeat(64);
  authorization(
    Response.json({ json: { accountId: "owner", deviceId, epoch: 1, expiresAt, credential } }),
  );
  expect(await rejected).toMatchObject({ name: "AbortError" });
  expect(owner.request.mock.calls.some(([method]) => method === "host.authorize")).toBe(false);
  const revoke = fetch.mock.calls.find(([request]) => request.url.endsWith("/hosts/revoke"))![0];
  expect(JSON.parse(await revoke.text())).toEqual({ json: { credential } });
});

it("reports a session authorization failure until the daemon confirms an authorized binding", async () => {
  const owner = host();
  const api = new DesktopApi(new SessionCookies(origin), async (request) =>
    request.url.endsWith("/hosts/authorize")
      ? Response.json({}, { status: 401 })
      : Response.json({ json: profile }),
  );
  const control = new DesktopControl(api, owner, undefined);
  await control.select("owner", "page", signal());
  await expect(
    control.request(
      "control_attach",
      {
        accountId: "owner",
        apiUrl: origin,
        grant: {
          deviceId: crypto.randomUUID(),
          epoch: 1,
          token: "renderer-grant",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      "page",
      signal(),
    ),
  ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  expect(
    await control.request("control_info", { accountId: "owner" }, "page", signal()),
  ).toMatchObject({ error: "AUTH_REQUIRED" });
  owner.request.mockResolvedValueOnce({ ...info, authorized: true });
  expect(
    await control.request("control_info", { accountId: "owner" }, "page", signal()),
  ).toMatchObject({ authorized: true, error: null });
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
  const control = new DesktopControl(api, owner, undefined);
  const pending = control.select("owner", "page", signal());
  const rejected = pending.catch((error: unknown) => error);
  await control.select(null, "logout", signal());
  expect(await rejected).toMatchObject({ code: "CANCELLED" });
  complete(Response.json({ json: profile }));
  await Promise.resolve();
  expect(owner.request.mock.calls.map(([method, params]) => [method, params])).toEqual([
    ["host.session", { accountId: null, apiUrl: origin }],
  ]);
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
  const control = new DesktopControl(api, owner, undefined);
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

it("overwrites native-owned origin and connector directories and rejects native-only repair", async () => {
  const owner = host();
  owner.request
    .mockResolvedValueOnce({ registered: false, code: "public-code" })
    .mockResolvedValueOnce([]);
  const control = new DesktopControl(new DesktopApi(new SessionCookies(origin)), owner, {
    codex: "/native/codex",
  });
  await control.localRequest(
    { method: "instance.begin", params: { origin: "https://evil.test" } },
    "page",
    signal(),
  );
  expect(owner.request.mock.calls[0]![1]).toMatchObject({ origin });
  await control.localRequest(
    { method: "connectors.status", params: { configDirs: { codex: "/renderer/path" } } },
    "page",
    signal(),
  );
  expect(owner.request.mock.calls[1]![1]).toEqual({ configDirs: { codex: "/native/codex" } });
  await expect(
    control.localRequest(
      { method: "connectors.install", params: { provider: "codex", recoverModified: true } },
      "page",
      signal(),
    ),
  ).rejects.toThrow("Native connector recovery required");
});

it("keeps the daemon's host binding when a cookie session is replaced by signing in again", async () => {
  const owner = host();
  const api = new DesktopApi(new SessionCookies(origin), async (request) =>
    request.url.includes("/api/auth/")
      ? Response.json({ success: true })
      : Response.json({ json: profile }),
  );
  const control = new DesktopControl(api, owner, undefined);
  await control.select("owner", "page", signal());
  owner.request.mockClear();
  for (const path of ["/api/auth/sign-in/email", "/api/auth/sign-up/email"])
    await control.request(
      "api_fetch",
      { path, method: "POST", headers: {}, body: "{}" },
      "page",
      signal(),
    );
  // Nothing told the daemon to drop its account: an expired cookie is not a logout.
  expect(owner.request).not.toHaveBeenCalled();
  // The page still has to prove the resulting account before it may act for it.
  await expect(
    control.request("control_info", { accountId: "owner" }, "page", signal()),
  ).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  await control.select("owner", "page", signal());
  expect(owner.request.mock.calls.map(([method, params]) => [method, params])).toEqual([
    ["host.session", { accountId: "owner", apiUrl: origin }],
  ]);
});

it("revokes host access on an explicit sign-out request", async () => {
  const owner = host();
  const api = new DesktopApi(new SessionCookies(origin), async (request) =>
    request.url.includes("/api/auth/")
      ? Response.json({ success: true })
      : Response.json({ json: profile }),
  );
  const control = new DesktopControl(api, owner, undefined);
  await control.select("owner", "page", signal());
  owner.request.mockClear();
  await control.request(
    "api_fetch",
    { path: "/api/auth/sign-out", method: "POST", headers: {}, body: "{}" },
    "page",
    signal(),
  );
  expect(owner.request.mock.calls.map(([method, params]) => [method, params])).toEqual([
    ["host.session", { accountId: null, apiUrl: origin }],
  ]);
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
