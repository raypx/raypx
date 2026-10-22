import { expect, it, vi } from "vite-plus/test";
import type { AuthSession } from "@raypx/auth/types";
import { configurationDefaults } from "@raypx/contracts/api";
import { createCache } from "../../../server/cache/cache.js";
import { createMemoryStore } from "../../../server/cache/memory.js";
import { createConfigurationService } from "../../../server/configuration/service.js";
import type {
  ConfigurationReader,
  ConfigurationRepository,
} from "../../../server/configuration/types.js";

function fixture() {
  const auth: AuthSession = {
    user: { id: "admin", email: "admin@example.test", name: "Admin", emailVerified: true },
    session: { id: "session", userId: "admin", expiresAt: new Date(Date.now() + 60000) },
  };
  const snapshot = { values: { ...configurationDefaults }, revision: 0, updatedAt: null };
  const repository: ConfigurationRepository = {
    read: vi.fn(async () => structuredClone(snapshot)),
    update: vi.fn(async (values, revision) => ({
      values,
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
    })),
  };
  return {
    auth,
    snapshot,
    repository,
    service: createConfigurationService({ repository, adminEmails: ["ADMIN@example.test"] }),
  };
}

it("injects a reader that observes subsequent changes without caching or leaking mutable values", async () => {
  const f = fixture();
  const consumer = (configuration: ConfigurationReader) => async () =>
    (await configuration.read()).values.siteName;
  const readName = consumer(f.service);
  expect(await readName()).toBe("Raypx");
  f.snapshot.values.siteName = "Updated";
  expect(await readName()).toBe("Updated");
  (await f.service.read()).values.siteName = "Local mutation";
  expect(await readName()).toBe("Updated");
});

it("validates direct writes and preserves the revision and authenticated editor", async () => {
  const f = fixture();
  const input = { values: { ...configurationDefaults, siteName: "  Configured  " }, revision: 4 };
  expect(await f.service.update(input, f.auth)).toMatchObject({
    values: { ...input.values, siteName: "Configured" },
    revision: 5,
  });
  expect(f.repository.update).toHaveBeenCalledWith(
    { ...input.values, siteName: "Configured" },
    4,
    "admin",
  );
  await expect(f.service.update({ ...input, revision: -1 }, f.auth)).rejects.toMatchObject({
    code: "INVALID_INPUT",
  });
  await expect(
    f.service.update({ ...input, values: { ...input.values, siteName: " " } }, f.auth),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(f.repository.update).toHaveBeenCalledOnce();
  vi.mocked(f.repository.update).mockResolvedValue(null);
  await expect(f.service.update(input, f.auth)).rejects.toMatchObject({
    code: "CONFIGURATION_CONFLICT",
  });
});

it("does not let direct callers bypass administrator/session checks", async () => {
  const f = fixture();
  const input = { values: configurationDefaults, revision: 0 };
  await expect(f.service.update(input, null)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  for (const auth of [
    { ...f.auth, user: { ...f.auth.user, emailVerified: false } },
    { ...f.auth, user: { ...f.auth.user, email: "other@example.test" } },
    { ...f.auth, session: { ...f.auth.session, userId: "other" } },
    { ...f.auth, session: { ...f.auth.session, expiresAt: new Date(0) } },
  ]) {
    expect(f.service.isAdmin(auth)).toBe(false);
    await expect(f.service.update(input, auth)).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(f.repository.update).not.toHaveBeenCalled();
});

it("sanitizes injected storage failures and refuses malformed storage results", async () => {
  const f = fixture();
  vi.mocked(f.repository.read).mockRejectedValue(new Error("private-database-credential"));
  vi.mocked(f.repository.update).mockRejectedValue(new Error("private-database-credential"));
  await expect(f.service.read()).rejects.toThrow(/^CONFIGURATION_UNAVAILABLE$/);
  await expect(
    f.service.update({ values: configurationDefaults, revision: 0 }, f.auth),
  ).rejects.toThrow(/^CONFIGURATION_UNAVAILABLE$/);
  vi.mocked(f.repository.read).mockResolvedValue({ ...f.snapshot, revision: -1 });
  await expect(f.service.read()).rejects.toThrow(/^CONFIGURATION_UNAVAILABLE$/);
});

it("serves brief cached reads, refreshes them after saves and never caches failures", async () => {
  const f = fixture();
  let time = 0;
  const cache = createCache(createMemoryStore({ now: () => time }));
  const service = createConfigurationService({
    repository: f.repository,
    adminEmails: ["admin@example.test"],
    cache,
    cacheTtlMs: 1000,
  });
  expect((await service.readCached()).values.siteName).toBe("Raypx");
  f.snapshot.values.siteName = "Elsewhere";
  (await service.readCached()).values.siteName = "Local mutation";
  expect((await service.readCached()).values.siteName).toBe("Raypx");
  expect((await service.read()).values.siteName).toBe("Elsewhere");
  // Another service sharing the cache, as per-request Worker runtimes do, reuses it.
  const sibling = createConfigurationService({
    repository: f.repository,
    adminEmails: [],
    cache,
    cacheTtlMs: 1000,
  });
  expect((await sibling.readCached()).values.siteName).toBe("Raypx");
  time = 1001;
  expect((await service.readCached()).values.siteName).toBe("Elsewhere");
  await service.update(
    { values: { ...configurationDefaults, siteName: "Saved" }, revision: 0 },
    f.auth,
  );
  expect((await sibling.readCached()).values.siteName).toBe("Saved");
  time = 3000;
  vi.mocked(f.repository.read).mockRejectedValueOnce(new Error("offline"));
  await expect(service.readCached()).rejects.toThrow(/^CONFIGURATION_UNAVAILABLE$/);
  expect((await service.readCached()).values.siteName).toBe("Elsewhere");
});
