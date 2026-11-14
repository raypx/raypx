import { expect, it, vi } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { desktopLoginPaths, desktopOAuthClientId, oauthTokenPath } from "@raypx/contracts/api";
import { createAuth, readAuthSession } from "./server.js";

const issuer = "http://localhost:3002";
const web = "http://localhost:3000";
const redirectUri = "http://127.0.0.1:41234/desktop-login/callback";
const state = "s".repeat(43);
const verifier = "a".repeat(43);
const sourceTime = new Date(Date.now() - 30 * 60_000);

async function fixture() {
  const auth = createAuth({
    database: memoryAdapter({
      user: [],
      account: [],
      session: [],
      verification: [],
      oauthClient: [],
      oauthConsent: [],
      oauthAccessToken: [],
      oauthRefreshToken: [],
      jwks: [],
    }),
    mailer: { sendVerification: vi.fn(), sendPasswordReset: vi.fn() },
    config: {
      baseURL: issuer,
      secret: "desktop-login-test-secret-at-least-32-characters",
      trustedOrigins: [web, "views://main"],
      production: false,
    },
  });
  const ctx = await auth.$context;
  ctx.skipOriginCheck = false;
  ctx.skipCSRFCheck = false;
  const user = await ctx.internalAdapter.createUser(
    {
      email: "owner@example.test",
      name: "Owner",
      emailVerified: true,
    },
    { method: "email-password" },
  );
  const source = await ctx.internalAdapter.createSession(
    user.id,
    false,
    { createdAt: sourceTime },
    true,
  );
  const { getCookies } = await import("better-auth/cookies");
  async function sign(token: string) {
    const name = getCookies(ctx.options).sessionToken.name;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(ctx.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = btoa(
      String.fromCharCode(
        ...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token))),
      ),
    );
    return `${name}=${encodeURIComponent(`${token}.${signature}`)}`;
  }
  const browser = { origin: web, cookie: await sign(source.token) };
  function post(path: string, body: unknown, headers?: Record<string, string>) {
    const encoded = body instanceof URLSearchParams;
    return auth.handler(
      new Request(new URL(path, issuer), {
        method: "POST",
        headers: {
          "content-type": encoded ? "application/x-www-form-urlencoded" : "application/json",
          ...headers,
        },
        body: encoded ? body : JSON.stringify(body),
      }),
    );
  }
  const app = (path: string, body: unknown, headers?: Record<string, string>) =>
    post(`/api/auth${path}`, body, headers);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const start = {
    redirectUri,
    state,
    challenge,
    device: "Test computer",
    webOrigin: web,
    nonce: "n".repeat(43),
  };
  async function begin(nonce = start.nonce) {
    const response = await app(desktopLoginPaths.start, {
      ...start,
      nonce,
    });
    expect(response.status).toBe(200);
    const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
    const initiated = await auth.handler(new Request(authorizationUrl, { headers: browser }));
    expect(initiated.status).toBe(302);
    const handoff = await auth.handler(new Request(initiated.headers.get("location")!));
    expect(handoff.status).toBe(302);
    const page = new URL(handoff.headers.get("location")!);
    expect(page.origin + page.pathname).toBe(`${web}/desktop-authorize`);
    return { oauthQuery: page.searchParams.get("oauth")!, nonce };
  }
  const decide = (oauthQuery: string, approve = true, accountId = user.id) =>
    app(desktopLoginPaths.decide, { oauthQuery, approve, accountId }, browser);
  async function authorize(oauthQuery: string) {
    const response = await decide(oauthQuery);
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()).toHaveLength(0);
    return new URL(((await response.json()) as { redirectUri: string }).redirectUri);
  }
  const token = (code: string, proof = verifier) =>
    post(
      oauthTokenPath,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: desktopOAuthClientId,
        code,
        redirect_uri: redirectUri,
        code_verifier: proof,
      }),
    );
  return {
    auth,
    ctx,
    user,
    source,
    post,
    app,
    browser,
    start,
    begin,
    decide,
    authorize,
    token,
    sign,
  };
}

it("uses the standard OAuth code and token endpoints, then creates an independent Desktop session once", async () => {
  const { auth, user, source, app, browser, begin, decide, authorize, token } = await fixture();
  const { oauthQuery, nonce } = await begin();
  expect(await (await app(desktopLoginPaths.inspect, { oauthQuery }, browser)).json()).toEqual({
    device: "Test computer",
    accountId: user.id,
    email: user.email,
  });
  const callback = await authorize(oauthQuery);
  expect(callback.origin + callback.pathname).toBe(redirectUri);
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("iss")).toBe(issuer);
  expect((await decide(oauthQuery)).status).toBe(400);
  const code = callback.searchParams.get("code")!;
  const issued = await token(code);
  expect(issued.status).toBe(200);
  expect(issued.headers.getSetCookie()).toHaveLength(0);
  const { access_token: accessToken, id_token: idToken } = (await issued.json()) as {
    access_token: string;
    id_token: string;
  };
  const exchange = (input: object, headers?: Record<string, string>) =>
    app(desktopLoginPaths.exchange, input, headers);
  const input = { accessToken, idToken, nonce };
  expect((await exchange({ ...input, nonce: "x".repeat(43) })).status).toBe(400);
  expect((await exchange(input, browser)).status).toBe(403);
  const responses = await Promise.all([exchange(input), exchange(input)]);
  expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual([200, 400]);
  const response = responses.find(({ ok }) => ok)!;
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const desktop = await readAuthSession(auth, new Headers({ cookie }));
  expect(desktop?.session).toMatchObject({ userId: user.id, createdAt: sourceTime });
  expect(desktop?.session.id).not.toBe(source.id);
  expect((await readAuthSession(auth, new Headers(browser)))?.session.id).toBe(source.id);
  expect((await token(code)).status).toBe(400);
  const metadata = await auth.handler(new Request(`${issuer}/.well-known/openid-configuration`));
  expect(await metadata.json()).toMatchObject({
    issuer,
    token_endpoint: `${issuer}${oauthTokenPath}`,
  });
});

it("rejects a changed browser account, invalid PKCE and a revoked source session", async () => {
  const { ctx, source, app, start, begin, decide, authorize, token } = await fixture();
  expect(
    (await app(desktopLoginPaths.start, { ...start, webOrigin: "https://other.test" })).status,
  ).toBe(400);
  const attempt = await begin("x".repeat(43));
  expect((await decide(attempt.oauthQuery, true, "different-account")).status).toBe(403);
  expect((await decide(attempt.oauthQuery.replace(state, "z".repeat(43)))).status).toBe(400);
  const pkce = await authorize(attempt.oauthQuery);
  expect((await token(pkce.searchParams.get("code")!, "b".repeat(43))).status).toBe(400);
  const { oauthQuery, nonce } = await begin("y".repeat(43));
  const callback = await authorize(oauthQuery);
  const response = await token(callback.searchParams.get("code")!);
  expect(response.status).toBe(200);
  const { access_token: accessToken, id_token: idToken } = (await response.json()) as {
    access_token: string;
    id_token: string;
  };
  await ctx.internalAdapter.deleteSession(source.token);
  expect((await app(desktopLoginPaths.exchange, { accessToken, idToken, nonce })).status).toBe(400);
});
