import { nativeClientOrigins } from "@raypx/core/auth";
import { expect, it } from "vitest";
import { getRelayEnvironment } from "./env.js";

const values = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://fixture:fixture@localhost/relay_test",
  REDIS_URL: "redis://localhost:6380",
  PUBLIC_URL: "https://app.example.test",
};
it("needs database and exact origins without authentication-server secrets", () => {
  expect(getRelayEnvironment(values)).toMatchObject({
    allowedOrigins: ["https://app.example.test", ...Object.values(nativeClientOrigins)],
  });
  expect(getRelayEnvironment(values)).not.toHaveProperty("AUTH_SECRET");
});
it.each(["DATABASE_URL", "PUBLIC_URL"])("rejects missing %s", (key) => {
  expect(() => getRelayEnvironment({ ...values, [key]: undefined })).toThrow(/Invalid|Production/i);
});
it.each([
  { DATABASE_URL: "https://database.example.test" },
  { REDIS_URL: "https://broker.example.test" },
  { EXTRA_ALLOWED_ORIGINS: "*" },
])("rejects invalid deployment configuration: %j", (override) => {
  expect(() => getRelayEnvironment({ ...values, ...override })).toThrow(
    /Invalid|Production|Relay|EXTRA_ALLOWED_ORIGINS/,
  );
});
