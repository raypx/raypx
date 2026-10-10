import { expect, test, vi } from "vite-plus/test";

const drivers = vi.hoisted(() => {
  const forbidden = () => {
    throw new Error("Import must not create a storage driver");
  };
  return {
    memory: vi.fn<() => never>(forbidden),
    redis: vi.fn<() => never>(forbidden),
    filesystem: vi.fn<() => never>(forbidden),
  };
});

vi.mock("unstorage/drivers/memory", () => ({ default: drivers.memory }));
vi.mock("unstorage/drivers/redis", () => ({ default: drivers.redis }));
vi.mock("unstorage/drivers/fs", () => ({ default: drivers.filesystem }));

const imported = await import("../../src/index.js");

test("importing the public factories and compatibility helpers creates no storage driver", () => {
  expect(typeof imported.createStorageInstance).toBe("function");
  expect(typeof imported.getStorage).toBe("function");
  expect(typeof imported.createCache).toBe("function");
  expect(drivers.memory).not.toHaveBeenCalled();
  expect(drivers.redis).not.toHaveBeenCalled();
  expect(drivers.filesystem).not.toHaveBeenCalled();
});
