import { expect, it } from "vite-plus/test";
import { getApiEnvironment } from "../../server/env.js";
it("requires explicit production configuration", () => {
  expect(() => getApiEnvironment({ NODE_ENV: "production" })).toThrow("Production requires");
  expect(getApiEnvironment({ NODE_ENV: "test" }).DATABASE_URL).toContain(":5433/raypx_foundation");
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
