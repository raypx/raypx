import { afterEach, expect, it, vi } from "vite-plus/test";
import { getApiEnvironment } from "../../server/env.js";
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
