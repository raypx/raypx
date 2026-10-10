import { expect, test, vi } from "vite-plus/test";

const constructor = vi.hoisted(() =>
  vi.fn<() => never>(() => {
    throw new Error("Import must not open SQLite");
  }),
);
vi.mock("better-sqlite3", () => ({ default: constructor }));
const imported = await import("../src/index.js");

test("importing auth and its compatibility facade does not construct SQLite or resolve an instance", async () => {
  expect(typeof imported.createAuth).toBe("function");
  expect(typeof imported.auth).toBe("object");
  expect(() => imported.getAuth()).toThrow(/not configured/);
  expect(constructor).not.toHaveBeenCalled();
});
