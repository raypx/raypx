import { beforeEach, expect, it, vi } from "vite-plus/test";
import type { AuthSession } from "@raypx/auth/types";
import type { Database, DatabaseConnection } from "@raypx/database/connection";
import { createApiClient } from "@raypx/client";
import { configurationDefaults, type ConfigurationSnapshot } from "@raypx/contracts/api";
import { createApiRuntime } from "../../server/runtime/server.js";
import { getApiEnvironment } from "../../server/env.js";
import type { RuntimeProviders } from "../../server/runtime/shared.js";

const mocks = vi.hoisted(() => ({
  connect: vi.fn<() => DatabaseConnection>(),
  readSession: vi.fn<(auth: unknown, headers: Headers) => Promise<AuthSession | null>>(),
}));
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
    createConfigurationRepository(db) {
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
    expect(ownedDatabases).toEqual(connections.map(({ db }) => db));
    expect(ownedDatabases[0]).not.toBe(ownedDatabases[1]);
    const auth: AuthSession = {
      user: { id: "admin", name: "Admin", email: "admin@example.test", emailVerified: true },
      session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60000) },
    };
    mocks.readSession.mockResolvedValueOnce(auth).mockResolvedValue(null);
    const headers = new Headers({ cookie: "test-session=fixture" });
    const initial = await first.configuration.read();
    const saved = await first.configuration.update(
      {
        values: { ...initial.values, siteName: "Configured directly" },
        revision: initial.revision,
      },
      await first.readSession(headers),
    );
    // Revocation is observed on the next call even though the process keeps its runtime.
    await expect(
      first.configuration.update(
        { values: { ...saved.values, siteName: "Must not save" }, revision: saved.revision },
        await first.readSession(headers),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect((await first.configuration.read()).values.siteName).toBe("Configured directly");
    expect((await second.configuration.read()).values.siteName).toBe("Raypx");

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
