import { expect, it, vi } from "vitest";
import {
  desktopLoginPaths,
  desktopLoginStartSchema,
  desktopOAuthClientId,
  oauthAuthorizePath,
  oauthTokenPath,
} from "@raypx/contracts/api";
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
    request: async () => ({
      version: "test",
      protocolVersion: 1 as const,
      owner: "daemon" as const,
    }),
  };
  const control = new DesktopControl(new DesktopApi(jar, upstream), host);
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
  return { control, call, callback, upstream, jar, page, host, getLogin: () => login };
}

it("uses a temporary listener and installs the exchange cookie only after a verified callback", async () => {
  const { control, call, callback, upstream, jar } = fixture();
  const attempt = id();
  try {
    expect(await call("browser_login_start", attempt)).toEqual({ authorizationUrl });
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

it("does not commit a cookie when the renderer cancels", async () => {
  const { control, call, callback, upstream, jar } = fixture();
  try {
    const attempt = id();
    await call("browser_login_start", attempt);
    const stopped = call("browser_login_wait", attempt);
    void stopped.catch(() => {});
    await call("browser_login_cancel", attempt);
    await expect(stopped).rejects.toMatchObject({ code: "DESKTOP_LOGIN_CANCELLED" });
    await expect(fetch(callback())).rejects.toThrow(/connect|refused/i);
    expect(jar.header(new URL(origin))).toBe("");
    expect(upstream).toHaveBeenCalledOnce();
  } finally {
    control.close();
  }
});
