import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import { migrateApiDatabase } from "./migrations.ts";

const mocks = vi.hoisted(() => ({
  getKeys: vi.fn<() => Promise<string[]>>(),
  getItemRaw: vi.fn<(key: string) => Promise<string | Uint8Array | null>>(),
  migrate: vi.fn<(url: string, directory: string) => Promise<void>>(),
}));
vi.mock("nitro/kv", () => ({
  useKV: () => ({ getKeys: mocks.getKeys, getItemRaw: mocks.getItemRaw }),
}));
vi.mock("@raypx/database", () => ({ migrateDatabase: mocks.migrate }));
const environment = {
  DATABASE_URL: "postgres://fixture:private-password@127.0.0.1:5432/raypx_startup_test",
  DATABASE_MIGRATE_ON_START: true,
};
const name = "20261104010101_startup_test";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getKeys.mockResolvedValue([`${name}:migration.sql`, `${name}:snapshot.json`]);
  mocks.getItemRaw.mockResolvedValue("select 1;\n");
  mocks.migrate.mockResolvedValue();
});

it("skips bundled assets and the database entirely when startup migration is disabled", async () => {
  await migrateApiDatabase({ ...environment, DATABASE_MIGRATE_ON_START: false });
  expect(mocks.getKeys).not.toHaveBeenCalled();
  expect(mocks.migrate).not.toHaveBeenCalled();
});

it.each([
  { source: "bundled text", contents: "select '迁移';\r\n" },
  { source: "development bytes", contents: new TextEncoder().encode("select '迁移';\r\n") },
])(
  "stages $source without changing its bytes and removes it after migration",
  async ({ contents }) => {
    mocks.getItemRaw.mockResolvedValue(contents);
    let staged = "";
    mocks.migrate.mockImplementation(async (url, directory) => {
      expect(url).toBe(environment.DATABASE_URL);
      staged = directory;
      expect(await readFile(join(directory, name, "migration.sql"), "utf8")).toBe(
        "select '迁移';\r\n",
      );
    });
    await migrateApiDatabase(environment);
    expect(mocks.migrate).toHaveBeenCalledOnce();
    expect(mocks.getItemRaw).toHaveBeenCalledExactlyOnceWith(`${name}:migration.sql`);
    await expect(stat(staged)).rejects.toMatchObject({ code: "ENOENT" });
  },
);

it("fails without disclosing SQL or credentials and cleans staged files", async () => {
  let staged = "";
  mocks.migrate.mockImplementation(async (url, directory) => {
    staged = directory;
    throw new Error(`Connection failed: ${url}; private SQL`);
  });
  await expect(migrateApiDatabase(environment)).rejects.toThrow(
    "API database migration failed. Check database availability and migrations.",
  );
  await expect(stat(staged)).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([{ keys: [] }, { keys: ["../escape:migration.sql"] }])(
  "rejects missing or unsafe assets",
  async ({ keys }) => {
    mocks.getKeys.mockResolvedValue(keys);
    await expect(migrateApiDatabase(environment)).rejects.toThrow("API database migration failed");
    expect(mocks.migrate).not.toHaveBeenCalled();
  },
);
