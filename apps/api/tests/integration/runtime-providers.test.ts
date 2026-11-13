import { beforeEach, expect, it, vi } from "vitest";
import type { AuthSession } from "@raypx/core/auth";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { createApiClient } from "@raypx/client/api";
import { configurationDefaults, type ConfigurationSnapshot } from "@raypx/contracts/api";
import { createApiRuntime } from "../../src/runtime/server.js";
import { getApiEnvironment } from "../../src/env.js";
import type { RuntimeProviders } from "../../src/runtime/shared.js";

const mocks = vi.hoisted(() => ({
  connect: vi.fn<() => DatabaseConnection>(),
  readSession: vi.fn<(auth: unknown, headers: Headers) => Promise<AuthSession | null>>(),
  migrate: vi.fn(async (_environment: unknown) => {}),
}));
vi.mock("../../src/runtime/migrations.js", () => ({ migrateApiDatabase: mocks.migrate }));
vi.mock("@raypx/database/connection", () => ({ connectDatabase: mocks.connect }));
vi.mock("@raypx/auth/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@raypx/auth/server")>()),
  readAuthSession: mocks.readSession,
}));
beforeEach(() => vi.clearAllMocks());

it("the server runtime accepts scoped providers and resolves a fresh session for direct writes", async () => {
  const connections: DatabaseConnection[] = [];
  mocks.connect.mockImplementation(() => {
    const connection = { db: {} as Database, close: vi.fn(async () => {}) };
    connections.push(connection);
    return connection;
  });
  const ownedDatabases: Database[] = [];
  const providers: RuntimeProviders = {
    createAdministrationRepository: () => ({
      begin: async () => crypto.randomUUID(),
      finish: async () => {},
      overview: async () => {
        throw new Error("Unused");
      },
      list: async () => {
        throw new Error("Unused");
      },
    }),
    createConfigRepository(db, audit) {
      ownedDatabases.push(db);
      let snapshot: ConfigurationSnapshot = {
        values: { ...configurationDefaults },
        revision: 0,
        updatedAt: null,
      };
      return {
        read: async () => structuredClone(snapshot),
        update: async (values, revision) => {
          if (snapshot.revision !== revision) return null;
          snapshot = { values, revision: revision + 1, updatedAt: new Date().toISOString() };
          const scope = audit.current();
          if (scope) scope.committed = true;
          return structuredClone(snapshot);
        },
      };
    },
  };
  const environment = { NODE_ENV: "test", ADMIN_EMAILS: "admin@example.test" };
  const create = () => createApiRuntime(getApiEnvironment(environment), providers);
  const first = await create();
  const second = await create();
  try {
    expect(mocks.migrate).toHaveBeenCalledTimes(2);
    expect(mocks.migrate.mock.calls[0]![0]).toMatchObject({ DATABASE_MIGRATE_ON_START: true });
    expect(ownedDatabases).toEqual(connections.map(({ db }) => db));
    expect(ownedDatabases[0]).not.toBe(ownedDatabases[1]);
    const auth: AuthSession = {
      user: {
        id: "admin",
        name: "Admin",
        email: "admin@example.test",
        emailVerified: true,
        role: "admin",
      },
      session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60000) },
    };
    mocks.readSession.mockResolvedValueOnce(auth).mockResolvedValue(null);
    const headers = new Headers({ cookie: "test-session=fixture" });
    const initial = await first.config.read();
    const saved = await first.config.update(
      {
        values: { ...initial.values, siteName: "Configured directly" },
        revision: initial.revision,
      },
      await first.readSession(headers),
    );
    // Revocation is observed on the next call even though the process keeps its runtime.
    await expect(
      first.config.update(
        { values: { ...saved.values, siteName: "Must not save" }, revision: saved.revision },
        await first.readSession(headers),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await first.config.read()).values.siteName).toBe("Configured directly");
    expect((await second.config.read()).values.siteName).toBe("Raypx");

    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: async (input, init) => first.app.fetch(new Request(input, init)),
    });
    expect(await client.configuration.access({})).toEqual({ allowed: false });
    await second.readSession(headers);
    expect(mocks.readSession).toHaveBeenCalledTimes(4);
    const authAdapters = mocks.readSession.mock.calls.map(([adapter]) => adapter);
    expect(authAdapters[0]).toBe(authAdapters[1]);
    expect(authAdapters[0]).toBe(authAdapters[2]);
    expect(authAdapters[0]).not.toBe(authAdapters[3]);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
  for (const connection of connections) expect(connection.close).toHaveBeenCalledOnce();
});

it("does not allocate the runtime database when startup migration fails", async () => {
  mocks.migrate.mockRejectedValueOnce(new Error("API database migration failed"));
  await expect(createApiRuntime(getApiEnvironment({ NODE_ENV: "test" }))).rejects.toThrow(
    "API database migration failed",
  );
  expect(mocks.connect).not.toHaveBeenCalled();
});
