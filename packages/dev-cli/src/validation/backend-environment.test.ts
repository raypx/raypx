import { expect, it } from "vitest";
import { backendEnvironment, backendPlan } from "./backends.js";

it("uses only explicitly selected disposable local databases and keeps browser flags separate", () => {
  const url = "postgres://raypx@127.0.0.1:55439/raypx_next_test_b";
  expect(backendPlan(["--database-url", url, "--with-e2e", "--", "--workers=1"])).toEqual({
    databaseURL: url,
    withE2E: true,
    visual: false,
    browserArgs: ["--workers=1"],
  });
  expect(backendPlan([]).databaseURL).toBeUndefined();
  for (const value of [
    "invalid",
    "postgres://remote.example/raypx_test",
    "postgres://localhost/production",
    `${url}?host=remote.example`,
    `${url}#fragment`,
  ])
    expect(() => backendPlan(["--database-url", value])).toThrow("disposable loopback");
  expect(() => backendPlan(["--", "--workers=1"])).toThrow("require --with-e2e");
});

it("routes visual intent to the browser wrapper while preserving owned journey arguments", () => {
  const plan = backendPlan([
    "--with-e2e",
    "--",
    "auto-review.spec.ts",
    "--workers=1",
    "--repeat-each=3",
    "--visual",
  ]);
  expect(plan.visual).toBe(true);
  expect(plan.browserArgs).toEqual(["auto-review.spec.ts", "--workers=1", "--repeat-each=3"]);
  expect(() => backendPlan(["--", "--visual"])).toThrow("require --with-e2e");
});

it("replaces operator endpoints without forcing test JSX transforms into production browser builds", () => {
  const source = {
    NODE_ENV: "test",
    DATABASE_URL: "operator-db",
    TEST_DATABASE_URL: "operator-test-db",
    REDIS_URL: "operator-redis",
    TEST_REDIS_URL: "operator-test-redis",
    PATH: "/opt/tools/bin",
    RAYPX_LIVE_AGENTS: "1",
  };
  const env = backendEnvironment(source, "owned-db");
  expect(env).toEqual({
    DATABASE_URL: "owned-db",
    TEST_DATABASE_URL: "owned-db",
    PATH: "/opt/tools/bin",
    RAYPX_LIVE_AGENTS: "0",
  });
  expect(source.NODE_ENV).toBe("test");
  expect(backendEnvironment(source, "owned-db", "owned-redis")).toMatchObject({
    REDIS_URL: "owned-redis",
    TEST_REDIS_URL: "owned-redis",
  });
});
