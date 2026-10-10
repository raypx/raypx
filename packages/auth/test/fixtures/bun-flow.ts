import assert from "node:assert/strict";
import { createDatabase, eq, runMigrations, withTransaction } from "@raypx/db";
import { account, session, user } from "@raypx/db/schema";
import { createAuth, getSession } from "../../src/index.js";

const origin = "http://localhost:3000";
const connection = createDatabase(":memory:");

try {
  runMigrations(connection.db);
  runMigrations(connection.db);
  const auth = createAuth({
    database: connection.db,
    secret: "bun-test-only-secret-with-at-least-32-characters",
    baseURL: origin,
    environment: "test",
  });
  const post = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${origin}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin,
          "sec-fetch-site": "same-origin",
          "sec-fetch-mode": "cors",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  const readCookies = (response: Response) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const request = (cookie: string) => new Request(`${origin}/api/session`, { headers: { cookie } });
  const password = "Bun-test-password-123!";
  const registered = await post("sign-up/email", {
    name: "Bun Person",
    email: "bun@example.com",
    password,
  });
  assert.equal(registered.status, 200, "Bun signup failed");
  assert.equal(connection.db.select().from(user).all().length, 1);
  const credential = connection.db.select().from(account).get();
  assert.ok(credential?.password);
  assert.notEqual(credential.password, password);
  const registeredCookie = readCookies(registered);
  const registeredSession = await getSession(request(registeredCookie), auth);
  assert.equal(registeredSession?.user.email, "bun@example.com");

  assert.throws(
    () =>
      withTransaction(connection.db, (tx) => {
        tx.update(user).set({ name: "Should roll back" }).run();
        throw new Error("rollback");
      }),
    /rollback/,
  );
  assert.equal(connection.db.select().from(user).get()?.name, "Bun Person");
  assert.throws(
    () =>
      connection.db
        .insert(session)
        .values({ id: "orphan", userId: "missing", token: "orphan", expiresAt: new Date() })
        .run(),
    /FOREIGN KEY/i,
  );

  const loggedIn = await post("sign-in/email", { email: "bun@example.com", password });
  assert.equal(loggedIn.status, 200, "Bun login failed");
  const loggedInCookie = readCookies(loggedIn);
  const active = await getSession(request(loggedInCookie), auth);
  assert.ok(active);
  const loggedOut = await post("sign-out", {}, loggedInCookie);
  assert.equal(loggedOut.status, 200, "Bun logout failed");
  assert.equal(await getSession(request(loggedInCookie), auth), null);
  assert.equal(
    connection.db.select().from(session).where(eq(session.id, active.session.id)).get(),
    undefined,
  );
  assert.ok(await getSession(request(registeredCookie), auth));
  connection.checkHealth();
  console.log("Bun SQLite auth flow passed");
} finally {
  connection.close();
}

connection.close();
assert.throws(() => connection.checkHealth());
