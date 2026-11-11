import { expect, it, vi } from "vite-plus/test";
import { DesktopApi } from "./api.js";
import { SessionCookies } from "./cookies.js";

const origin = "https://api.example.test";
const signal = () => new AbortController().signal;
const request = (path = "/rpc/account/get", extra: Record<string, unknown> = {}) => ({
  method: "POST",
  path,
  headers: { "content-type": "application/json" },
  body: "{}",
  ...extra,
});

it.each([
  request("https://evil.test/rpc/account/get"),
  request("//evil.test/rpc/account/get"),
  request("/rpc/hosts/authorize"),
  request("/rpc/hosts/grant"),
  request("/rpc/instances/poll"),
  request("/rpc/admin/overview"),
  request("/api/auth/sign-in/social"),
  request("/rpc/account/get#fragment"),
  request("/rpc/account/get", { method: "DELETE" }),
  request("/rpc/account/get", { method: "GET" }),
  request("/rpc/account/get", { headers: { authorization: "private" } }),
  request("/rpc/account/get", { headers: { cookie: "private" } }),
  request("/rpc/account/get", {
    headers: { "content-type": "application/json\r\nmalicious: true" },
  }),
  request("/rpc/account/get", { body: "😀".repeat(128 * 1024) }),
])("rejects requests beyond the renderer surface before HTTP", async (input) => {
  const fetch = vi.fn();
  const api = new DesktopApi(new SessionCookies(origin), fetch);
  await expect(api.request(input, "page", signal())).rejects.toMatchObject({
    code: "INVALID_API_REQUEST",
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps cookies and authorization response headers in the daemon and redacts auth body tokens", async () => {
  const fetch = vi.fn(async (_request: Request) =>
    Response.json(
      {
        token: "private-token",
        user: { id: "owner" },
        session: { token: "private-session", id: "public-session-id" },
      },
      {
        headers: {
          "set-cookie":
            "__Secure-better-auth.session_token=private-cookie; Secure; HttpOnly; Path=/; Max-Age=3600",
          authorization: "private",
          "x-request-id": "public-id",
        },
      },
    ),
  );
  const api = new DesktopApi(new SessionCookies(origin), fetch);
  const response = await api.request(request("/api/auth/sign-in/email"), "page", signal());
  expect(response.headers).toEqual({
    "content-type": "application/json;charset=utf-8",
    "x-request-id": "public-id",
  });
  expect(JSON.parse(response.body)).toEqual({
    user: { id: "owner" },
    session: { id: "public-session-id" },
  });
  await api.request(request(), "page", signal());
  const forwarded = fetch.mock.calls[1]![0];
  expect(forwarded.headers.get("cookie")).toContain("private-cookie");
  expect(forwarded.headers.get("origin")).toBe("views://main");
});

it("rejects redirects, oversized response streams and unsafe RPC serializer metadata", async () => {
  const responses = [
    Response.redirect("https://evil.test/", 302),
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1));
          controller.close();
        },
      }),
    ),
    Response.json({ json: {}, meta: [{ secret: "private" }] }),
  ];
  const api = new DesktopApi(new SessionCookies(origin), async () => responses.shift()!);
  await expect(api.request(request(), "page", signal())).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  await expect(api.request(request(), "page", signal())).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  await expect(api.rpc("account.get", {}, signal())).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
});

it("scopes cancellation to the page, releases uncooperative reads and ignores their late cookies", async () => {
  let complete!: (response: Response) => void;
  const fetch = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  const jar = new SessionCookies(origin);
  const api = new DesktopApi(jar, fetch);
  const id = crypto.randomUUID();
  const operation = api.request(request("/rpc/account/get", { id }), "first", signal());
  api.cancel("other", id);
  await expect(
    api.request(request("/rpc/account/get", { id }), "first", signal()),
  ).rejects.toMatchObject({ code: "API_BUSY" });
  api.cancel("first", id);
  await expect(operation).rejects.toMatchObject({ code: "CANCELLED" });
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

it("bounds Set-Cookie changes atomically and sanitizes network failures", async () => {
  const headers = new Headers();
  for (let index = 0; index < 33; index++)
    headers.append("set-cookie", `better-auth.chunk${index}=value; Secure; HttpOnly`);
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({}, { headers }))
    .mockRejectedValueOnce(new Error("private diagnostic"));
  const jar = new SessionCookies(origin),
    api = new DesktopApi(jar, fetch);
  await expect(api.request(request(), "page", signal())).rejects.toMatchObject({
    code: "INVALID_API_RESPONSE",
  });
  expect(jar.header(new URL(origin))).toBe("");
  await expect(api.request(request(), "page", signal())).rejects.toThrow("API request failed");
});
