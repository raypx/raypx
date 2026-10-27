import { expect, it } from "vite-plus/test";
import { backendEnvironment } from "../../src/validation/backends.js";

it("replaces operator endpoints without forcing test JSX transforms into production browser builds", () => {
  const source = {
    NODE_ENV: "test",
    DATABASE_URL: "operator-db",
    TEST_DATABASE_URL: "operator-test-db",
    REDIS_URL: "operator-redis",
    TEST_REDIS_URL: "operator-test-redis",
    NODE_BINARY: "pinned-node",
    RAYPX_LIVE_AGENTS: "1",
  };
  const env = backendEnvironment(source, "owned-db");
  expect(env).toEqual({
    DATABASE_URL: "owned-db",
    TEST_DATABASE_URL: "owned-db",
    NODE_BINARY: "pinned-node",
    RAYPX_LIVE_AGENTS: "0",
  });
  expect(source.NODE_ENV).toBe("test");
  expect(backendEnvironment(source, "owned-db", "owned-redis")).toMatchObject({
    REDIS_URL: "owned-redis",
    TEST_REDIS_URL: "owned-redis",
  });
});
