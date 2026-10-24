import { expect, it, vi } from "vite-plus/test";
import { createDesktopApi, parseApiOrigin, type NativeCookies } from "../../native/api";
import type { DesktopApiRequest } from "../../api";

function fixture() {
  const values: ReturnType<NativeCookies["get"]> = [];
  const cookies: NativeCookies = {
    get: () => values,
    set: (value) => {
      const index = values.findIndex((item) => item.name === value.name);
      if (index >= 0) values.splice(index, 1);
      values.push(value);
      return true;
    },
    remove: (_url, name) => {
      const index = values.findIndex((item) => item.name === name);
      if (index >= 0) values.splice(index, 1);
      return true;
    },
  };
  const send = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () =>
    Response.json({ ok: true }),
  );
  return {
    values,
    cookies,
    send,
    api: createDesktopApi("https://api.example.test", cookies, send),
  };
}
const get = (path = "/api/auth/get-session"): DesktopApiRequest => ({
  path,
  method: "GET",
  headers: {},
});

it("keeps secure login cookies in Native, restores them in a new client, and strips them from bridge responses", async () => {
  const f = fixture();
  f.send.mockResolvedValueOnce(
    Response.json(
      { user: { id: "account" } },
      {
        headers: {
          "set-cookie":
            "__Secure-better-auth.session_token=private-token; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=3600",
        },
      },
    ),
  );
  const response = await f.api.request({
    path: "/api/auth/sign-in/email",
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  expect(response.headers).not.toHaveProperty("set-cookie");
  expect(response.body).not.toContain("private-token");
  expect(f.values).toMatchObject([
    {
      name: "__Secure-better-auth.session_token",
      httpOnly: true,
      secure: true,
      domain: "api.example.test",
    },
  ]);
  const restarted = createDesktopApi("https://api.example.test", f.cookies, f.send);
  await restarted.request({ path: "/rpc/account/get", method: "POST", headers: {}, body: "{}" });
  const options = f.send.mock.calls[1]![1];
  expect(new Headers(options.headers).get("cookie")).toBe(
    "__Secure-better-auth.session_token=private-token",
  );
  expect(new Headers(options.headers).get("origin")).toBe("views://main");
  expect(options.redirect).toBe("manual");
});
it("clears the native session when the API expires a login cookie", async () => {
  const f = fixture();
  f.values.push({
    name: "__Secure-better-auth.session_token",
    value: "private",
    domain: "api.example.test",
    path: "/",
    secure: true,
    httpOnly: true,
  });
  f.send.mockResolvedValueOnce(
    Response.json(
      {},
      {
        headers: {
          "set-cookie": "__Secure-better-auth.session_token=; Path=/; HttpOnly; Secure; Max-Age=0",
        },
      },
    ),
  );
  await f.api.request({ path: "/api/auth/sign-out", method: "POST", headers: {}, body: "{}" });
  expect(f.values).toEqual([]);
  await f.api.request(get());
  expect(new Headers(f.send.mock.calls[1]![1].headers).has("cookie")).toBe(false);
});
it("rejects arbitrary destinations, private endpoints, methods and caller-supplied credentials before fetching", async () => {
  const f = fixture();
  for (const input of [
    get("https://evil.example/api/auth/get-session"),
    get("//evil.example/api/auth/get-session"),
    get("/\\evil.example/api/auth/get-session"),
    get("/api/auth/../admin"),
    get("/rpc/tasks/list"),
    { ...get(), method: "DELETE" },
    { ...get(), headers: { Cookie: "stolen" } },
    { ...get(), headers: { Authorization: "Bearer private" } },
    { ...get(), headers: { Origin: "https://evil.example" } },
    { ...get(), body: "x".repeat(256 * 1024 + 1) },
  ])
    await expect(f.api.request(input)).rejects.toThrow(/API|RPC/);
  expect(f.send).not.toHaveBeenCalled();
  for (const origin of [
    "http://external.example",
    "https://user:pass@example.test",
    "file:///etc/passwd",
    "https://api.example.test/other",
  ])
    expect(() => parseApiOrigin(origin)).toThrow(/Server URL/);
});
it("rejects insecure or unrelated-domain session cookies and response bodies over the bridge budget", async () => {
  const f = fixture();
  for (const cookie of [
    "__Secure-better-auth.session_token=x; Path=/; HttpOnly",
    "__Secure-better-auth.session_token=x; Path=/; HttpOnly; Secure; Domain=evil.example",
  ]) {
    f.send.mockResolvedValueOnce(Response.json({}, { headers: { "set-cookie": cookie } }));
    await expect(f.api.request(get())).rejects.toThrow(/API.*cookie/);
  }
  expect(f.values).toEqual([]);
  f.send.mockResolvedValueOnce(new Response("x".repeat(8 * 1024 * 1024 + 1)));
  await expect(f.api.request(get())).rejects.toThrow("exceeds limit");
});
it("forwards only unexpired scoped auth cookies and never follows redirects", async () => {
  const f = fixture();
  f.values.push(
    { name: "other", value: "private", domain: "api.example.test" },
    {
      name: "better-auth.expired",
      value: "private",
      domain: "api.example.test",
      expirationDate: 1,
    },
    { name: "better-auth.wrong", value: "private", domain: "evil.example" },
  );
  f.send.mockResolvedValueOnce(
    new Response(null, {
      status: 302,
      headers: { location: "https://evil.example", "set-cookie": "unrelated=private" },
    }),
  );
  const result = await f.api.request(get());
  expect(result.status).toBe(302);
  expect(result.headers).not.toHaveProperty("location");
  expect(new Headers(f.send.mock.calls[0]![1].headers).has("cookie")).toBe(false);
  expect(f.send).toHaveBeenCalledTimes(1);
});
