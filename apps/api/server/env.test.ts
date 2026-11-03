import { afterEach, expect, it, vi } from "vite-plus/test";
import { getApiEnvironment } from "./env.js";
afterEach(() => vi.unstubAllEnvs());
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
    S3_ENDPOINT: "",
    S3_BUCKET: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
    POSTHOG_PROJECT_TOKEN: "",
    POSTHOG_HOST: "",
  });
  expect(environment.REDIS_URL).toBeUndefined();
  expect(environment.s3).toBeUndefined();
  expect(environment.AUTH_DOMAIN).toBeUndefined();
  expect(environment.MAIL_DEFAULT_LOCALE).toBe("en");
});

it("enables object storage only with a complete S3 configuration", () => {
  expect(getApiEnvironment({ NODE_ENV: "test" }).s3).toBeUndefined();
  expect(() =>
    getApiEnvironment({ NODE_ENV: "test", S3_BUCKET: "raypx", S3_ENDPOINT: "https://s3.test" }),
  ).toThrow("Object storage requires");
  expect(
    getApiEnvironment({
      NODE_ENV: "test",
      S3_ENDPOINT: "https://s3.example.test",
      S3_BUCKET: "raypx",
      S3_ACCESS_KEY_ID: "id",
      S3_SECRET_ACCESS_KEY: "secret",
    }).s3,
  ).toEqual({
    endpoint: "https://s3.example.test",
    region: "auto",
    bucket: "raypx",
    accessKeyId: "id",
    secretAccessKey: "secret",
  });
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
