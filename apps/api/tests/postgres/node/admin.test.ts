import { cleanupExpired } from "../../../src/jobs/cleanup.js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { adminAudit, user, systemConfiguration } from "@raypx/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createAuth, readAuthSession } from "@raypx/auth/server";
import { createApiClient } from "@raypx/client/api";
import { configurationDefaults } from "@raypx/contracts/api";
import { createApiApp } from "../../helpers/app.js";
import { AuditService } from "../../../src/admin/audit.js";
import { createAdministrationRepository } from "../../../src/admin/repository.js";
import { createAuditedAuthAdapter } from "../../../src/admin/auth-adapter.js";
import { createConfigurationRepository } from "../../../src/config/repository.js";
import { createConfigurationService } from "../../../src/config/service.js";
import { createAccessPolicy } from "../../../src/access.js";
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url),
  db = connection.db;
const repository = createAdministrationRepository(db),
  audit = new AuditService(repository);
const config = createConfigurationService({
  repository: createConfigurationRepository(db, audit),
  audit,
  access: createAccessPolicy(),
});
const authOptions = {
  database: createAuditedAuthAdapter(db, audit),
  config: {
    baseURL: "http://localhost:3002",
    secret: "administration-test-secret-32-characters",
    trustedOrigins: ["http://localhost:3000"],
    production: false,
  },
  mailer: { sendVerification: async () => {}, sendPasswordReset: async () => {} },
};
const auth = createAuth(authOptions);
const options = {
  readiness: {
    database: () => db.execute(sql`select 1`),
    redis: async () => {
      throw new Error("unavailable");
    },
  },
  audit,
  administration: repository,
  config,
  authHandler: (request: Request) => auth.handler(request),
  readSession: (headers: Headers) => readAuthSession(auth, headers),
  allowedOrigins: ["http://localhost:3000"],
};
const app = createApiApp(options);
const accounts: string[] = [];
let administrator = "",
  member = "",
  adminCookie = "",
  memberCookie = "";
const post = (path: string, body: unknown, cookie: string, application = app) =>
  application.fetch(
    new Request(`http://localhost:3002/api/auth/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
      body: JSON.stringify(body),
    }),
  );
const client = () =>
  createApiClient({
    baseUrl: "http://localhost:3002",
    headers: { cookie: adminCookie, origin: "http://localhost:3000" },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  });
beforeAll(async () => {
  await migrateDatabase(url);
  for (let index = 0; index < 2; index++) {
    const email = `admin-audit-${crypto.randomUUID()}@example.test`;
    const response = await post(
      "sign-up/email",
      { email, name: "Audit Fixture", password: "fixture-password-123" },
      "",
    );
    if (response.status !== 200) throw new Error("Fixture signup failed");
    const [row] = await db.select().from(user).where(eq(user.email, email));
    accounts.push(row!.id);
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, row!.id));
    if (index === 0)
      await (await auth.$context).internalAdapter.updateUser(row!.id, { role: "admin" });
    const login = await post("sign-in/email", { email, password: "fixture-password-123" }, "");
    if (login.status !== 200) throw new Error("Fixture sign-in failed");
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    if (index === 0) {
      administrator = row!.id;
      adminCookie = cookie;
    } else {
      member = row!.id;
      memberCookie = cookie;
    }
  }
});
afterAll(async () => {
  await db.delete(systemConfiguration).where(eq(systemConfiguration.updatedBy, administrator));
  for (const id of accounts) await db.delete(user).where(eq(user.id, id));
  await connection.close();
});
it("commits role and configuration changes with safe durable audit and records refusals", async () => {
  expect((await post("admin/set-role", { userId: member, role: "admin" }, "")).status).toBe(403);
  expect(
    (await post("admin/set-role", { userId: administrator, role: "member" }, adminCookie)).status,
  ).toBe(403);
  expect(
    (await post("admin/set-role", { userId: administrator, role: "admin" }, memberCookie)).status,
  ).toBe(403);
  await expect(
    createApiClient({
      baseUrl: "http://localhost:3002",
      headers: { cookie: memberCookie },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    }).admin.overview({ days: 7 }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(
    (await post("admin/set-role", { userId: member, role: "admin" }, adminCookie)).status,
  ).toBe(200);
  const [change] = await db
    .select()
    .from(adminAudit)
    .where(
      and(
        eq(adminAudit.actorId, administrator),
        eq(adminAudit.targetId, member),
        eq(adminAudit.outcome, "success"),
      ),
    );
  expect(change).toMatchObject({ before: { role: "member" }, after: { role: "admin" } });
  await repository.finish(change!.id, "failed", "RESPONSE_FAILED");
  expect(
    (await db.select().from(adminAudit).where(eq(adminAudit.id, change!.id)))[0]?.outcome,
  ).toBe("success");
  expect(await client().admin.health({})).toMatchObject({
    checks: { database: "ok", redis: "unavailable", relay: "not-configured" },
  });
  expect((await readAuthSession(auth, new Headers({ cookie: memberCookie })))?.user.role).toBe(
    "admin",
  );
  const snapshot = await config.read();
  await client().configuration.update({
    values: { ...configurationDefaults, siteName: "Audited site" },
    revision: snapshot.revision,
  });
  const rows = await repository.list({ limit: 50, actorId: administrator });
  expect(
    rows.entries.some(
      (entry) =>
        entry.action === "configuration.update" &&
        entry.outcome === "success" &&
        entry.after?.siteName === "Audited site",
    ),
  ).toBe(true);
  expect(rows.entries.some((entry) => entry.outcome === "rejected")).toBe(true);
  await expect(
    client().configuration.update({ values: configurationDefaults, revision: snapshot.revision }),
  ).rejects.toBeDefined();
  expect(
    (await repository.list({ limit: 50 })).entries.some((entry) => entry.outcome === "failed"),
  ).toBe(true);
  const overview = await client().admin.overview({ days: 7 });
  expect(overview.registrations).toHaveLength(7);
  expect(overview.totalUsers).toBeGreaterThanOrEqual(2);
  const response = await createApiClient({
    baseUrl: "http://localhost:3002",
    headers: { cookie: memberCookie },
    fetch: async (input, init) => app.fetch(new Request(input, init)),
  }).admin.audit({ limit: 1 });
  expect(response.entries).toHaveLength(1);
});
it("blocks mutations when intent storage is unavailable", async () => {
  const unavailable = new AuditService({
    ...repository,
    begin: async () => {
      throw new Error("offline");
    },
  });
  const deniedApp = createApiApp({ ...options, audit: unavailable });
  const result = await post(
    "admin/set-role",
    { userId: member, role: "member" },
    adminCookie,
    deniedApp,
  );
  expect(result.status).toBe(503);
  expect(await result.json()).toMatchObject({ code: "AUDIT_UNAVAILABLE" });
  const [row] = await db.select().from(user).where(eq(user.id, member));
  expect(row?.role).toBe("admin");
  const current = await config.read();
  const deniedClient = createApiClient({
    baseUrl: "http://localhost:3002",
    headers: { cookie: adminCookie, origin: "http://localhost:3000" },
    fetch: async (input, init) => deniedApp.fetch(new Request(input, init)),
  });
  await expect(
    deniedClient.configuration.update({
      values: configurationDefaults,
      revision: current.revision,
    }),
  ).rejects.toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    data: { error: { code: "AUDIT_UNAVAILABLE" } },
  });
  expect((await config.read()).revision).toBe(current.revision);
});
it("rolls back actual role writes if the success audit cannot commit", async () => {
  await db.execute(
    sql`create function public.audit_test_reject() returns trigger language plpgsql as $$ begin if new.outcome = 'success' then raise exception 'audit test unavailable'; end if; return new; end $$`,
  );
  await db.execute(
    sql`create trigger audit_test_reject before update on public.admin_audit for each row execute function public.audit_test_reject()`,
  );
  try {
    expect(
      (await post("admin/set-role", { userId: member, role: "member" }, adminCookie)).status,
    ).toBeGreaterThanOrEqual(500);
    const [row] = await db.select().from(user).where(eq(user.id, member));
    expect(row?.role).toBe("admin");
    const current = await config.read();
    await expect(
      config.update(
        { values: configurationDefaults, revision: current.revision },
        await readAuthSession(auth, new Headers({ cookie: adminCookie })),
      ),
    ).rejects.toBeDefined();
    expect((await config.read()).revision).toBe(current.revision);
  } finally {
    await db.execute(sql`drop trigger audit_test_reject on public.admin_audit`);
    await db.execute(sql`drop function public.audit_test_reject()`);
  }
});
it("rechecks administrator permission when concurrent role updates reach the database", async () => {
  const initial = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(inArray(user.id, accounts));
  await db.update(user).set({ role: "admin" }).where(inArray(user.id, accounts));
  const ready = Promise.withResolvers<void>();
  let arrived = 0;
  const concurrentAuth = createAuth({
    ...authOptions,
    database: (adapterOptions) => {
      const adapter = authOptions.database(adapterOptions);
      return {
        ...adapter,
        async update<T>(input: Parameters<typeof adapter.update>[0]) {
          if (input.model === "user" && "role" in input.update) {
            // Admit both requests before either one starts the audited role transaction.
            if (++arrived === 2) ready.resolve();
            await ready.promise;
          }
          return adapter.update<T>(input);
        },
      };
    },
  });
  const concurrentApp = createApiApp({
    ...options,
    authHandler: (request) => concurrentAuth.handler(request),
  });
  const timeout = setTimeout(
    () => ready.reject(new Error("Role updates did not both reach storage")),
    5000,
  );
  try {
    const responses = await Promise.all([
      post("admin/set-role", { userId: member, role: "member" }, adminCookie, concurrentApp),
      post(
        "admin/set-role",
        { userId: administrator, role: "member" },
        memberCookie,
        concurrentApp,
      ),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 403]);
    const denied = responses.find((response) => response.status === 403)!;
    expect(await denied.json()).toMatchObject({ code: "FORBIDDEN" });
    const users = await db.select({ role: user.role }).from(user).where(inArray(user.id, accounts));
    expect(users.map(({ role }) => role).sort()).toEqual(["admin", "member"]);
    const entries = await db
      .select({ outcome: adminAudit.outcome })
      .from(adminAudit)
      .where(
        inArray(
          adminAudit.requestId,
          responses.map((response) => response.headers.get("x-request-id")!),
        ),
      );
    expect(entries.map(({ outcome }) => outcome).sort()).toEqual(["rejected", "success"]);
  } finally {
    clearTimeout(timeout);
    for (const { id, role } of initial) await db.update(user).set({ role }).where(eq(user.id, id));
  }
});
it("keeps history after account deletion and uses stable pagination without exposing secrets", async () => {
  const history = await repository.list({ limit: 1 });
  expect(history.next).not.toBeNull();
  const next = await repository.list({ limit: 1, cursor: history.next! });
  expect(next.entries[0]?.id).not.toBe(history.entries[0]?.id);
  const pending = await repository.begin({
    action: "configuration.update",
    actorId: administrator,
    requestId: crypto.randomUUID(),
    source: "service",
  });
  await db
    .update(adminAudit)
    .set({ startedAt: new Date(Date.now() - 60000) })
    .where(eq(adminAudit.id, pending));
  expect(
    (await repository.list({ limit: 50, outcome: "unknown" })).entries.some(
      (entry) => entry.id === pending,
    ),
  ).toBe(true);
  await db
    .update(adminAudit)
    .set({ startedAt: new Date("2010-06-01T00:00:00Z") })
    .where(eq(adminAudit.id, pending));
  await cleanupExpired(db);
  expect(
    (
      await repository.list({ limit: 50, from: "2010-01-01T00:00:00Z", to: "2011-01-01T00:00:00Z" })
    ).entries.some((entry) => entry.id === pending),
  ).toBe(true);
  await db.delete(user).where(eq(user.id, member));
  expect((await repository.list({ limit: 50, targetId: member })).entries.length).toBeGreaterThan(
    0,
  );
  expect(JSON.stringify(history)).not.toContain("fixture-password");
});
