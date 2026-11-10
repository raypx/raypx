import { expect, it, vi } from "vite-plus/test";
import type { LocalMethod } from "@raypx/contracts/local";
import { DesktopApi } from "./api.ts";
import { DesktopControl } from "./control.ts";
import { SessionCookies } from "./cookies.ts";

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
