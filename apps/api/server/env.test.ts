import { afterEach, expect, it, vi } from "vitest";
import { getApiEnvironment, getServerRole } from "./env.js";
afterEach(() => vi.unstubAllEnvs());
it("defaults to a combined backend and requires a broker for split API", () => {
  expect(getApiEnvironment({}).SERVER_ROLE).toBe("both");
  expect(() => getApiEnvironment({ SERVER_ROLE: "api" })).toThrow("requires REDIS_URL");
  expect(
    getApiEnvironment({ SERVER_ROLE: "api", REDIS_URL: "redis://localhost:6380" }).SERVER_ROLE,
  ).toBe("api");
  expect(getServerRole({ SERVER_ROLE: "relay" })).toBe("relay");
  expect(() => getServerRole({ SERVER_ROLE: "worker" })).toThrow("Invalid option");
  expect(() => getApiEnvironment({ SERVER_ROLE: "relay" })).toThrow(
    "Invalid environment variables",
  );
});
it("uses only explicit runtime inputs without inheriting deployment connections", () => {
  vi.stubEnv("DATABASE_URL", "postgres://fixture:fixture@operator.example:5432/operator");
  vi.stubEnv("REDIS_URL", "redis://operator.example:6379");
  const environment = getApiEnvironment({ NODE_ENV: "test" });
  expect(environment.DATABASE_URL).toBe(
    "postgres://postgres:postgres@localhost:5433/raypx_foundation",
  );
  expect(environment.REDIS_URL).toBeUndefined();
});
it("requires explicit production configuration", () => {
  expect(() => getApiEnvironment({ NODE_ENV: "production" })).toThrow("Production requires");
  expect(getApiEnvironment({ NODE_ENV: "test" }).DATABASE_URL).toContain(":5433/raypx_foundation");
});

it("migrates on startup by default and accepts only an explicit boolean switch", () => {
  expect(getApiEnvironment({ NODE_ENV: "test" }).DATABASE_MIGRATE_ON_START).toBe(true);
  expect(getApiEnvironment({ DATABASE_MIGRATE_ON_START: "true" }).DATABASE_MIGRATE_ON_START).toBe(
    true,
  );
  expect(getApiEnvironment({ DATABASE_MIGRATE_ON_START: "false" }).DATABASE_MIGRATE_ON_START).toBe(
    false,
  );
  expect(() => getApiEnvironment({ DATABASE_MIGRATE_ON_START: "0" })).toThrow(
    "Invalid environment variables",
  );
});

it("treats unconfigured optional Compose settings as absent", () => {
  const environment = getApiEnvironment({
    REDIS_URL: "",
    AUTH_DOMAIN: "",
    POSTHOG_PROJECT_TOKEN: "",
    POSTHOG_HOST: "",
  });
  expect(environment.REDIS_URL).toBeUndefined();
  expect(environment.AUTH_DOMAIN).toBeUndefined();
});

it.each(["GOOGLE", "GITHUB"] as const)("requires complete %s OAuth credentials", (provider) => {
  expect(() => getApiEnvironment({ [`${provider}_CLIENT_ID`]: "id" })).toThrow(
    `${provider} login requires both`,
  );
  expect(() => getApiEnvironment({ [`${provider}_CLIENT_SECRET`]: "secret" })).toThrow(
    `${provider} login requires both`,
  );
  const environment = getApiEnvironment({
    [`${provider}_CLIENT_ID`]: "id",
    [`${provider}_CLIENT_SECRET`]: "secret",
  });
  expect(environment[`${provider}_CLIENT_ID`]).toBe("id");
  expect(
    getApiEnvironment({ [`${provider}_CLIENT_ID`]: "", [`${provider}_CLIENT_SECRET`]: "" })[
      `${provider}_CLIENT_ID`
    ],
  ).toBeUndefined();
});
