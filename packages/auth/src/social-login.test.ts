import { expect, it, vi } from "vite-plus/test";
import type { OAuthProvider } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth, type AuthMailer } from "./server.js";
import type { SocialProvider } from "@raypx/core/auth";

async function fixture(provider: SocialProvider, registrationAllowed = true, emailVerified = true) {
  const records: Record<
    "user" | "account" | "session" | "verification",
    Record<string, unknown>[]
  > = {
    user: [],
    account: [],
    session: [],
    verification: [],
  };
  const mailer = {
    sendVerification: vi.fn(async () => {}),
    sendPasswordReset: vi.fn<AuthMailer["sendPasswordReset"]>(async () => {}),
  };
  const auth = createAuth({
    database: memoryAdapter(records),
    mailer,
    registrationAllowed: async () => registrationAllowed,
    config: {
      baseURL: "http://localhost:3002",
      secret: "test-foundation-secret-at-least-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      production: false,
      socialProviders: { [provider]: { clientId: "test-client", clientSecret: "test-secret" } },
    },
  });
  const context = await auth.$context;
  // Better Auth relaxes origin checks under test; exercise the production policy.
  context.skipOriginCheck = false;
  context.skipCSRFCheck = false;
  const implementation: OAuthProvider = context.socialProviders.find(
    (item) => item.id === provider,
  )!;
  vi.spyOn(implementation, "validateAuthorizationCode").mockResolvedValue({
    accessToken: "fixture-token",
  });
  vi.spyOn(implementation, "getUserInfo").mockResolvedValue({
    user: { email: "social@example.test", name: "Social", emailVerified },
    data: { sub: "provider-user", id: "provider-user" },
  });
  const callbackURL = "http://localhost:3000/login?oauth=success&returnTo=%2Ftasks";
  const start = async (destination = callbackURL) =>
    auth.handler(
      new Request("http://localhost:3002/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          provider,
          callbackURL: destination,
          errorCallbackURL: "http://localhost:3000/login?returnTo=%2Ftasks",
        }),
      }),
    );
  const finish = async (response: Response, cancelled = false) => {
    const { url } = (await response.json()) as { url: string };
    const state = new URL(url).searchParams.get("state")!;
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return auth.handler(
      new Request(
        `http://localhost:3002/api/auth/callback/${provider}?state=${state}&${cancelled ? "error=access_denied" : "code=fixture-code"}`,
        { headers: { cookie } },
      ),
    );
  };
  return { auth, records, mailer, callbackURL, start, finish };
}

it.each(["google", "github"] as const)(
  "exposes only configured %s and completes its OAuth callback",
  async (provider) => {
    const { auth, records, callbackURL, start, finish } = await fixture(provider);
    const discovery = await auth.handler(
      new Request("http://localhost:3002/api/auth/social-providers"),
    );
    expect(await discovery.json()).toEqual({ providers: [provider] });
    const started = await start();
    expect(started.status).toBe(200);
    const details = (await started.clone().json()) as { url: string };
    const url = new URL(details.url);
    expect(url.searchParams.get("redirect_uri")).toBe(
      `http://localhost:3002/api/auth/callback/${provider}`,
    );
    expect(url.searchParams.get("state")).toBeTruthy();
    const finished = await finish(started);
    expect(finished.status).toBe(302);
    expect(finished.headers.get("location")).toBe(callbackURL);
    expect(records.user).toMatchObject([
      { email: "social@example.test", emailVerified: true, role: "member" },
    ]);
    expect(records.account).toMatchObject([{ providerId: provider, accountId: "provider-user" }]);
    expect(records.session).toHaveLength(1);
  },
);

it("lets a GitHub account set its first password with a one-time email link", async () => {
  const { auth, records, mailer, start, finish } = await fixture("github");
  const signedIn = await finish(await start());
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const listAccounts = () =>
    auth.handler(
      new Request("http://localhost:3002/api/auth/list-accounts", { headers: { cookie } }),
    );
  const email = "social@example.test";
  const password = "first-password-123";
  const post = (path: string, body: object) =>
    auth.handler(
      new Request(`http://localhost:3002/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify(body),
      }),
    );
  expect(await (await listAccounts()).json()).toMatchObject([{ providerId: "github" }]);
  const redirectTo = "http://localhost:3000/reset-password";
  expect((await post("request-password-reset", { email, redirectTo })).status).toBe(200);
  expect(mailer.sendPasswordReset).toHaveBeenCalledTimes(1);
  const [message] = mailer.sendPasswordReset.mock.calls[0]!;
  expect(message.email).toBe(email);
  expect((await post("reset-password", { newPassword: password })).status).toBe(400);

  const link = await auth.handler(new Request(message.url));
  expect(link.status).toBe(302);
  const landing = new URL(link.headers.get("location")!);
  expect(`${landing.origin}${landing.pathname}`).toBe(redirectTo);
  const token = landing.searchParams.get("token");
  expect(token).toBeTruthy();
  expect((await post("reset-password", { token, newPassword: password })).status).toBe(200);
  expect(
    (await post("reset-password", { token, newPassword: "replacement-password" })).status,
  ).toBe(400);
  expect(records.account.map((account) => account.providerId)).toEqual(["github", "credential"]);
  const login = await post("sign-in/email", { email, password });
  expect(login.status).toBe(200);
  expect(records.user).toHaveLength(1);
  expect(await login.json()).toMatchObject({ user: { id: records.user[0]!.id } });
});

it("rejects callback origins outside the configured application", async () => {
  const { start, records } = await fixture("google");
  expect((await start("https://attacker.invalid/login")).status).toBe(403);
  expect(records.verification).toHaveLength(0);
});

it("returns cancelled authorization to the login page without creating a session", async () => {
  const { start, finish, records } = await fixture("github");
  const result = await finish(await start(), true);
  const url = new URL(result.headers.get("location")!);
  expect(url.origin).toBe("http://localhost:3000");
  expect(url.pathname).toBe("/login");
  expect(url.searchParams.get("error")).toBe("access_denied");
  expect(url.searchParams.get("returnTo")).toBe("/tasks");
  expect(records.user).toHaveLength(0);
  expect(records.session).toHaveLength(0);
});

it("enforces the registration switch during OAuth user creation", async () => {
  const { start, finish, records } = await fixture("google", false);
  const result = await finish(await start());
  expect(new URL(result.headers.get("location")!).searchParams.has("error")).toBe(true);
  expect(records.user).toHaveLength(0);
  expect(records.session).toHaveLength(0);
});

it("requires verification before issuing a session for an unverified provider email", async () => {
  const { start, finish, records, mailer } = await fixture("github", true, false);
  const result = await finish(await start());
  expect(new URL(result.headers.get("location")!).searchParams.has("error")).toBe(true);
  expect(records.session).toHaveLength(0);
  expect(mailer.sendVerification).toHaveBeenCalledOnce();
});

it.each([true, false])(
  "links an existing email only when the local account is verified (%s)",
  async (verified) => {
    const { start, finish, records } = await fixture("google", false);
    records.user.push({
      id: "existing-user",
      email: "social@example.test",
      name: "Existing",
      emailVerified: verified,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await finish(await start());
    expect(records.user).toHaveLength(1);
    const url = new URL(result.headers.get("location")!);
    expect(url.searchParams.get("oauth")).toBe(verified ? "success" : null);
    expect(url.searchParams.has("error")).toBe(!verified);
    expect(records.session).toMatchObject(verified ? [{ userId: "existing-user" }] : []);
    expect(records.account).toMatchObject(
      verified ? [{ userId: "existing-user", providerId: "google" }] : [],
    );
    expect(records.session).toHaveLength(verified ? 1 : 0);
    expect(records.account).toHaveLength(verified ? 1 : 0);
  },
);

it("consumes OAuth state once so callback replay cannot create another session", async () => {
  const { start, finish, records } = await fixture("github");
  const started = await start();
  const replay = started.clone();
  await finish(started);
  const result = await finish(replay);
  expect(new URL(result.headers.get("location")!).searchParams.has("error")).toBe(true);
  expect(records.session).toHaveLength(1);
});
