import { expect, test, vi } from "vite-plus/test";

const constructor = vi.hoisted(() =>
  vi.fn<() => never>(() => {
    throw new Error("Import must not open SQLite");
  }),
);
vi.mock("better-sqlite3", () => ({ default: constructor }));
const imported = await import("../src/index.js");

test("importing database helpers and schema never constructs SQLite", () => {
  expect(typeof imported.createDatabase).toBe("function");
  expect(typeof imported.runMigrations).toBe("function");
  expect(constructor).not.toHaveBeenCalled();
});
