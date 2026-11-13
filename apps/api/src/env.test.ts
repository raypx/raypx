import { afterEach, expect, it, vi } from "vitest";
import {
  getApiEnvironment,
  getRelayEnvironment,
  getServerRole,
  getWorkerEnvironment,
} from "./env.js";
afterEach(() => vi.unstubAllEnvs());
it("defaults to every role and allows PostgreSQL-only split API and worker roles", () => {
  expect(getApiEnvironment({}).SERVER_ROLE).toBe("all");
  expect(getServerRole({})).toBe("all");
  expect(getApiEnvironment({ SERVER_ROLE: "api" }).SERVER_ROLE).toBe("api");
  expect(getServerRole({ SERVER_ROLE: "relay" })).toBe("relay");
  expect(getServerRole({ SERVER_ROLE: "worker" })).toBe("worker");
  expect(getServerRole({ SERVER_ROLE: "both" })).toBe("both");
  expect(getApiEnvironment({ SERVER_ROLE: "both" }).SERVER_ROLE).toBe("both");
  expect(() => getServerRole({ SERVER_ROLE: "unknown" })).toThrow("Invalid option");
  expect(() => getApiEnvironment({ SERVER_ROLE: "relay" })).toThrow(
    "Invalid environment variables",
  );
});
it("worker and relay do not require or parse API authentication or mail settings", () => {
  const environment = getWorkerEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://fixture:fixture@db.example.test:5432/raypx_test",
    AUTH_SECRET: "invalid",
    APP_KEY: "synthetic-app-key-for-tests-only-32-chars",
    AUTH_URL: "invalid",
    RESEND_API_KEY: "invalid",
  });
  expect(environment).not.toHaveProperty("AUTH_SECRET");
  expect(environment.APP_KEY).toBe("synthetic-app-key-for-tests-only-32-chars");
  expect(environment).not.toHaveProperty("AUTH_URL");
  expect(environment).not.toHaveProperty("REDIS_URL");
  expect(environment.RUN_RECOVERY_INTERVAL_MS).toBe(5_000);
  expect(
    getRelayEnvironment({
      DATABASE_URL: environment.DATABASE_URL,
      ALLOWED_ORIGINS: "https://app.example.test",
    }).REDIS_URL,
  ).toBeUndefined();
});
it("requires the shared application key for production member-connection recovery", () => {
  expect(() =>
    getWorkerEnvironment({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://fixture:fixture@db.example.test:5432/raypx_test",
    }),
  ).toThrow("Production worker requires APP_KEY");
});
it("validates lease heartbeat headroom and recovery bounds", () => {
  expect(() => getWorkerEnvironment({ RUN_RECOVERY_INTERVAL_MS: "0" })).toThrow(
    "Invalid environment variables",
  );
  expect(() => getWorkerEnvironment({ RUN_LEASE_MS: "100", RUN_HEARTBEAT_MS: "75" })).toThrow(
    "at least two heartbeats",
  );
  expect(() => getApiEnvironment({ RUN_LEASE_MS: "100", RUN_HEARTBEAT_MS: "75" })).toThrow(
    "at least two heartbeats",
  );
  expect(getWorkerEnvironment({ RUN_RECOVERY_INTERVAL_MS: "250" }).RUN_RECOVERY_INTERVAL_MS).toBe(
    250,
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
it("requires a production application key that is independent of the auth secret", () => {
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://fixture:fixture@db.example.test:5432/raypx",
    AUTH_URL: "https://app.example.test",
    AUTH_SECRET: "synthetic-auth-secret-for-tests-32-chars",
    APP_KEY: "synthetic-app-key-for-tests-only-32-chars",
    ALLOWED_ORIGINS: "https://app.example.test",
  };
  expect(getApiEnvironment(production).APP_KEY).toBe(production.APP_KEY);
  const { APP_KEY: _, ...missing } = production;
  expect(() => getApiEnvironment(missing)).toThrow("Production requires");
  expect(() =>
    getApiEnvironment({ ...production, APP_KEY: "raypx-development-only-app-key-32-characters" }),
  ).toThrow("APP_KEY must be explicitly configured");
  expect(() => getApiEnvironment({ ...production, APP_KEY: production.AUTH_SECRET })).toThrow(
    "APP_KEY must differ from AUTH_SECRET",
  );
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

it("requires a dedicated paired email relay credential without parsing it in the worker", () => {
  const token = "routine-relay-fixture-token-dedicated-32-characters";
  expect(getApiEnvironment({}).ROUTINE_EMAIL_RELAY_TOKEN).toBeUndefined();
  expect(() => getApiEnvironment({ ROUTINE_EMAIL_RELAY_TOKEN: token })).toThrow(
    "Routine email requires",
  );
  expect(() => getApiEnvironment({ ROUTINE_EMAIL_DOMAIN: "mail.example.test" })).toThrow(
    "Routine email requires",
  );
  const input = { ROUTINE_EMAIL_RELAY_TOKEN: token, ROUTINE_EMAIL_DOMAIN: "mail.example.test" };
  expect(getApiEnvironment(input).ROUTINE_EMAIL_DOMAIN).toBe("mail.example.test");
  expect(() => getApiEnvironment({ ...input, APP_KEY: token })).toThrow("must be dedicated");
  expect(() => getApiEnvironment({ ...input, SANDBOX_SUPERVISOR_TOKEN: token })).toThrow(
    "must be dedicated",
  );
  expect(() =>
    getApiEnvironment({ ...input, AGENT_MODEL_CREDENTIALS: JSON.stringify({ model: token }) }),
  ).toThrow("must be dedicated");
  const worker = getWorkerEnvironment({ ...input, ROUTINE_EMAIL_RELAY_TOKEN: "invalid" });
  expect(worker).not.toHaveProperty("ROUTINE_EMAIL_RELAY_TOKEN");
  expect(worker.ROUTINE_EMAIL_DOMAIN).toBe("mail.example.test");
});
