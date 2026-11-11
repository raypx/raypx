import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { systemConfiguration, user } from "@raypx/database/schema";
import { configurationDefaults } from "@raypx/contracts/api";
import { eq } from "drizzle-orm";
import { createConfigurationRepository } from "../../../server/configuration/repository.js";

const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test"))
  throw new Error("An isolated *_test database is required");
const connection = connectDatabase(url);
const actor = `settings-${crypto.randomUUID()}`;
const repository = createConfigurationRepository(connection.db);
beforeAll(async () => {
  await migrateDatabase(url);
  // This gate owns an isolated test database and restores the singleton in afterAll.
  const existing = await connection.db.select().from(systemConfiguration);
  if (existing.length) throw new Error("Configuration tests require an empty settings table");
  await connection.db
    .insert(user)
    .values({ id: actor, email: `${actor}@example.test`, name: "Fixture" });
});
afterAll(async () => {
  try {
    await connection.db.delete(systemConfiguration).where(eq(systemConfiguration.updatedBy, actor));
    await connection.db.delete(user).where(eq(user.id, actor));
  } finally {
    await connection.close();
  }
});

it("allows one concurrent first save, persists it across clients, and protects later revisions", async () => {
  expect(await repository.read()).toEqual({
    values: configurationDefaults,
    revision: 0,
    updatedAt: null,
  });
  const writes = await Promise.all([
    repository.update({ ...configurationDefaults, siteName: "First" }, 0, actor),
    repository.update({ ...configurationDefaults, siteName: "Second" }, 0, actor),
  ]);
  expect(writes.filter(Boolean)).toHaveLength(1);
  const other = connectDatabase(url);
  try {
    expect(await createConfigurationRepository(other.db).read()).toEqual(writes.find(Boolean));
  } finally {
    await other.close();
  }
  const edits = await Promise.all([
    repository.update({ ...configurationDefaults, cleanupEnabled: false }, 1, actor),
    repository.update({ ...configurationDefaults, registrationEnabled: false }, 1, actor),
  ]);
  expect(edits.filter(Boolean)).toHaveLength(1);
  expect((await repository.read()).revision).toBe(2);
});
