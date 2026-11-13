import { expect, it, vi } from "vitest";
import {
  desktopLoginPaths,
  desktopLoginStartSchema,
  desktopOAuthClientId,
  oauthAuthorizePath,
  oauthTokenPath,
} from "@raypx/contracts/api";
import type { LocalMethod } from "@raypx/contracts/local";
import { DesktopApi } from "./api.js";
import { DesktopControl } from "./control.js";
import { parseSessionCookie, SessionCookies } from "./cookies.js";

const origin = "https://api.example.test";
const authorizationUrl = `${origin}${oauthAuthorizePath}?state=fixture`;
const code = "c".repeat(43);
const id = () => crypto.randomUUID();

function fixture() {
  const jar = new SessionCookies(origin);
  const page = new AbortController();
  const binding = {
    accountId: "owner",
    origin,
    instanceId: id(),
    publicKey: "k".repeat(32),
    name: "Test",
    platform: "darwin",
    appVersion: "1",
    status: "registered",
    version: 1,
    revision: 1,
    issuedAt: new Date().toISOString(),
  };
  let login: ReturnType<typeof desktopLoginStartSchema.parse> | undefined;
  function checkOAuthRequest(input: URLSearchParams) {
    expect(input.get("grant_type")).toBe("authorization_code");
    expect(input.get("client_id")).toBe(desktopOAuthClientId);
    expect(input.get("code")).toBe(code);
    expect(input.get("redirect_uri")).toBe(login?.redirectUri);
    expect(
      new Bun.CryptoHasher("sha256").update(input.get("code_verifier")!).digest("base64url"),
    ).toBe(login?.challenge);
  }
  const upstream = vi.fn(async (request: Request) => {
    expect(request.headers.has("cookie")).toBe(false);
    expect(request.headers.has("origin")).toBe(false);
    if (request.url.endsWith(desktopLoginPaths.start)) {
      login = desktopLoginStartSchema.parse(await request.json());
      return Response.json({ authorizationUrl });
    }
    if (request.url === `${origin}${oauthTokenPath}`) {
      checkOAuthRequest(new URLSearchParams(await request.text()));
      return Response.json({
        access_token: "a".repeat(32),
        id_token: "fixture-oidc-id-token",
        token_type: "Bearer",
        scope: "openid",
      });
    }
    expect(request.url).toBe(`${origin}/api/auth${desktopLoginPaths.exchange}`);
    expect(await request.json()).toEqual({
      accessToken: "a".repeat(32),
      idToken: "fixture-oidc-id-token",
      nonce: login?.nonce,
    });
    return Response.json(
      { accountId: "owner" },
      {
        headers: {
          "Set-Cookie":
            "__Secure-better-auth.session_token=desktop-fixture; Path=/; Secure; HttpOnly",
        },
      },
    );
  });
  const host = {
    request: vi.fn(async (method: LocalMethod) => {
      expect(method).toBe("instance.status");
      return { state: "registered", binding };
    }),
  };
  const control = new DesktopControl(new DesktopApi(jar, upstream), host, undefined);
  const call = (method: string, attemptId: string, client = "page") =>
    control.request(
      method,
      {
        id: attemptId,
        ...(method === "browser_login_start" ? { webOrigin: "https://web.example.test" } : {}),
      },
      client,
      page.signal,
    );
  function callback(state?: string) {
    const url = new URL(login!.redirectUri);
    url.searchParams.set("state", state ?? login!.state);
    url.searchParams.set("code", code);
    url.searchParams.set("iss", origin);
    return url;
  }
  return { control, call, callback, upstream, jar, page, host, binding, getLogin: () => login };
}

it("uses a temporary listener and installs the exchange cookie only after a verified callback", async () => {
  const { control, call, callback, upstream, jar, getLogin } = fixture();
  const attempt = id();
  try {
    expect(await call("browser_login_start", attempt)).toEqual({ authorizationUrl });
    expect(getLogin()?.accountId).toBe("owner");
    await expect(call("browser_login_wait", attempt, "another-page")).rejects.toMatchObject({
      code: "DESKTOP_LOGIN_EXPIRED",
    });
    expect((await fetch(callback("x".repeat(43)))).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
    jar.apply([
      parseSessionCookie(
        jar.origin,
        "__Secure-better-auth.session_data=old; Path=/; Secure; HttpOnly",
      )!,
    ]);
    const completion = call("browser_login_wait", attempt);
    const response = await fetch(callback());
    expect(response.status).toBe(200);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).not.toContain(code);
    expect(await completion).toBe(true);
    expect(jar.header(new URL(origin))).toBe("__Secure-better-auth.session_token=desktop-fixture");
  } finally {
    control.close();
  }
});

it("does not commit a cookie when the profile changes or the renderer cancels", async () => {
  const { control, call, callback, upstream, jar, binding } = fixture();
  try {
    const first = id();
    await call("browser_login_start", first);
    const completion = call("browser_login_wait", first);
    void completion.catch(() => {});
    binding.accountId = "different-account";
    await fetch(callback());
    await expect(completion).rejects.toMatchObject({ code: "DESKTOP_LOGIN_ACCOUNT_MISMATCH" });
    expect(jar.header(new URL(origin))).toBe("");
    const second = id();
    await call("browser_login_start", second);
    const stopped = call("browser_login_wait", second);
    void stopped.catch(() => {});
    await call("browser_login_cancel", second);
    await expect(stopped).rejects.toMatchObject({ code: "DESKTOP_LOGIN_CANCELLED" });
    await expect(fetch(callback())).rejects.toThrow(/unable to connect/i);
    expect(upstream).toHaveBeenCalledTimes(4);
  } finally {
    control.close();
  }
});
