import { expect, test } from "vite-plus/test";
import { getClientEnv, parseClientEnv } from "../src/client.js";

test("exposes no public fields until they are explicitly supported", () => {
  expect(getClientEnv()).toEqual({});
  expect(Object.isFrozen(getClientEnv())).toBe(true);
});

test("strips server credentials and undeclared public variables", () => {
  const env = parseClientEnv({
    SESSION_SECRET: "private-test-value",
    DATABASE_URL: "postgres://private-test-value",
    VITE_API_KEY: "private-test-value",
    VITE_APP_NAME: "unimplemented",
    NODE_ENV: "production",
  });
  expect(env).toEqual({});
  expect(Object.isFrozen(env)).toBe(true);
});
