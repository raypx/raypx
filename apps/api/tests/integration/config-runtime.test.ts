import { expect, it, vi } from "vitest";
import type { Database } from "@raypx/database/connection";
import { createApiClient } from "@raypx/client/api";
import { configurationDefaults } from "@raypx/contracts/api";
import { getApiEnvironment } from "../../src/env.js";
import { createApiLogging } from "../../src/logging.js";
import { createRuntime, type RuntimeResources } from "../../src/runtime/shared.js";

it("scopes injected repositories to each runtime and shares the service with HTTP and jobs", async () => {
  const logger = createApiLogging({ environment: "test", sink: () => {} });
  const connections: Database[] = [];
  const close = vi.fn(async () => {});
  const resources: RuntimeResources = {
    logger,
    connect: () => {
      const db = { transaction: vi.fn() } as unknown as Database;
      connections.push(db);
      return { db, close };
    },
    closeLogger: async () => {},
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
    createConfigurationRepository: vi.fn<
      NonNullable<RuntimeResources["createConfigurationRepository"]>
    >((_db, audit) => {
      let snapshot = {
        values: { ...configurationDefaults, cleanupEnabled: false },
        revision: 0,
        updatedAt: null as string | null,
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
    }),
  };
  const env = getApiEnvironment({
    NODE_ENV: "test",
    JOBS_ENABLED: "true",
    ADMIN_EMAILS: "admin@example.test",
  });
  const first = await createRuntime(env, resources);
  const second = await createRuntime(env, resources);
  try {
    expect(resources.createConfigurationRepository).toHaveBeenNthCalledWith(
      1,
      connections[0],
      expect.anything(),
    );
    expect(resources.createConfigurationRepository).toHaveBeenNthCalledWith(
      2,
      connections[1],
      expect.anything(),
    );
    const initial = await first.configuration.read();
    await first.configuration.update(
      { revision: initial.revision, values: { ...initial.values, siteName: "First runtime" } },
      {
        user: {
          id: "admin",
          name: "Admin",
          email: "admin@example.test",
          emailVerified: true,
          role: "admin",
        },
        session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60000) },
      },
    );
    expect((await second.configuration.read()).values.siteName).toBe("Raypx");
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: async (input, init) => first.app.fetch(new Request(input, init)),
    });
    expect(await client.configuration.public({})).toEqual({
      siteName: "First runtime",
      registrationEnabled: true,
    });
    expect(await first.jobs.cleanup()).toMatchObject({ status: "disabled" });
  } finally {
    await Promise.all([first.close(), second.close()]);
    await logger.close();
  }
  expect(close).toHaveBeenCalledTimes(2);
});
