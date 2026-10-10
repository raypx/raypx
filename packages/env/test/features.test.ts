import { expect, test } from "vite-plus/test";
import { parseServerEnv, ServerEnvironmentError } from "../src/server.js";

test("optional providers do not require credentials while disabled", () => {
  expect(parseServerEnv({ AUTH_ENABLED: "false", METRICS_ENABLED: "false" })).toMatchObject({
    AUTH_ENABLED: false,
    METRICS_ENABLED: false,
  });
  expect(parseServerEnv({}).DATABASE_PATH).toBeUndefined();
});

test("active providers require their credentials without including values in errors", () => {
  expect(() => parseServerEnv({ AUTH_ENABLED: "true" })).toThrow("BETTER_AUTH_SECRET");
  expect(() => parseServerEnv({ AUTH_ENABLED: true })).toThrow("BETTER_AUTH_URL");
  expect(() => parseServerEnv({ METRICS_ENABLED: "true" })).toThrow("METRICS_TOKEN");
  const secret = "secret-sentinel";
  const error = (() => {
    try {
      parseServerEnv({
        AUTH_ENABLED: true,
        BETTER_AUTH_SECRET: secret,
        BETTER_AUTH_URL: "bad-origin",
      });
    } catch (caught) {
      return caught;
    }
    return undefined;
  })();
  expect(error).toBeInstanceOf(ServerEnvironmentError);
  expect(String(error)).not.toContain(secret);
  expect(String(error)).not.toContain("bad-origin");
});

test("normalizes canonical origins and requires HTTPS for production auth", () => {
  expect(
    parseServerEnv({
      AUTH_ENABLED: "true",
      BETTER_AUTH_URL: "http://localhost:5173/",
      BETTER_AUTH_SECRET: "s".repeat(32),
    }).BETTER_AUTH_URL,
  ).toBe("http://localhost:5173");
  expect(() =>
    parseServerEnv({
      NODE_ENV: "production",
      AUTH_ENABLED: true,
      BETTER_AUTH_URL: "http://example.com",
      BETTER_AUTH_SECRET: "s".repeat(32),
    }),
  ).toThrow("BETTER_AUTH_URL");
  expect(
    parseServerEnv({
      NODE_ENV: "production",
      AUTH_ENABLED: true,
      BETTER_AUTH_URL: "https://example.com",
      BETTER_AUTH_SECRET: "s".repeat(32),
    }).AUTH_ENABLED,
  ).toBe(true);
});

test.each([
  "https://user:pass@example.com",
  "https://example.com/path",
  "https://example.com?key=value",
  "https://example.com#hash",
  "file:///tmp/example",
])("rejects noncanonical APP_ORIGIN %s", (APP_ORIGIN) => {
  expect(() => parseServerEnv({ APP_ORIGIN })).toThrow("APP_ORIGIN");
});

test("validates feature switches and rate limiting without coercing garbage", () => {
  for (const value of ["1", "yes", 1, null]) {
    expect(() => parseServerEnv({ AUTH_ENABLED: value })).toThrow("AUTH_ENABLED");
    expect(() => parseServerEnv({ METRICS_ENABLED: value })).toThrow("METRICS_ENABLED");
  }
  for (const value of ["0", "abc", "1.5", "1000001", false]) {
    expect(() => parseServerEnv({ API_RATE_LIMIT_MAX: value })).toThrow("API_RATE_LIMIT_MAX");
    expect(() => parseServerEnv({ API_RATE_LIMIT_WINDOW_MS: value })).toThrow(
      "API_RATE_LIMIT_WINDOW_MS",
    );
  }
  expect(
    parseServerEnv({ API_RATE_LIMIT_MAX: "120", API_RATE_LIMIT_WINDOW_MS: "60000" }),
  ).toMatchObject({
    API_RATE_LIMIT_MAX: 120,
    API_RATE_LIMIT_WINDOW_MS: 60_000,
  });
  expect(() => parseServerEnv({ DATABASE_PATH: "bad\0path" })).toThrow("DATABASE_PATH");
});

test.each(["\n", " ", "é", "\t"])(
  "rejects metrics tokens containing header-unsafe character %j",
  (character) => {
    expect(() =>
      parseServerEnv({ METRICS_ENABLED: true, METRICS_TOKEN: "a".repeat(32) + character + "b" }),
    ).toThrow("METRICS_TOKEN");
  },
);
