import { expect, it } from "vite-plus/test";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuth } from "../src/server.js";

it("allows old valid sessions, validates names and requires trusted mutation origins", async () => {
  const data: Record<string, Record<string, unknown>[]> = {
    user: [],
    account: [],
    session: [],
    verification: [],
    rateLimit: [],
  };
  const origin = "https://api.example.test";
  const auth = createAuth({
    database: memoryAdapter(data),
    mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
    config: {
      baseURL: origin + "/",
      secret: "session-security-test-secret-with-32-characters",
      trustedOrigins: ["views://main"],
      production: true,
    },
  });
  const call = (path: string, body?: object, cookie?: string, source?: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(body ? { "content-type": "application/json" } : {}),
          ...(cookie ? { cookie } : {}),
          ...(source ? { origin: source } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  expect(
    (
      await call("sign-up/email", {
        email: "user@example.test",
        password: "password-123456",
        name: "  User  ",
      })
    ).status,
  ).toBe(200);
  expect(data.user?.[0]?.name).toBe("User");
  data.user![0]!.emailVerified = true;
  const signedIn = await call("sign-in/email", {
    email: "user@example.test",
    password: "password-123456",
  });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  for (const session of data.session!) session.createdAt = new Date(Date.now() - 48 * 3600_000);
  expect((await call("list-sessions", undefined, cookie)).status).toBe(200);
  for (const path of ["update-user", "revoke-session", "revoke-other-sessions", "revoke-sessions"])
    for (const source of [undefined, "https://untrusted.test"])
      expect(
        (
          await call(
            path,
            path === "update-user" ? { name: "Updated" } : { token: "other" },
            cookie,
            source,
          )
        ).status,
      ).toBe(403);
  for (const name of ["   ", "x".repeat(81)])
    expect((await call("update-user", { name }, cookie, "views://main")).status).toBe(400);
  expect((await call("update-user", { name: "  Updated  " }, cookie, "views://main")).status).toBe(
    200,
  );
  expect(data.user?.[0]?.name).toBe("Updated");
  expect((await call("revoke-other-sessions", {}, cookie, origin)).status).toBe(200);
  expect((await call("list-sessions")).status).toBe(401);
});
