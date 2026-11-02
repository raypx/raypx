import { expect, it } from "vite-plus/test";
import { getRelayEnvironment } from "../../src/env.js";

const values = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://fixture:fixture@localhost/relay_test",
  REDIS_URL: "redis://localhost:6380",
  ALLOWED_ORIGINS: "https://app.example.test,views://main,raypx://",
};
it("needs database, private broker and exact origins without authentication-server secrets", () => {
  expect(getRelayEnvironment(values)).toMatchObject({
    PORT: 3003,
    allowedOrigins: ["https://app.example.test", "views://main"],
  });
  expect(getRelayEnvironment(values)).not.toHaveProperty("AUTH_SECRET");
});
it.each(["DATABASE_URL", "REDIS_URL", "ALLOWED_ORIGINS"])("rejects missing %s", (key) => {
  expect(() => getRelayEnvironment({ ...values, [key]: undefined })).toThrow(
    /Invalid|environment/i,
  );
});
it.each([
  { DATABASE_URL: "https://database.example.test" },
  { REDIS_URL: "https://broker.example.test" },
  { NODE_ENV: "production", PORT: "0" },
  { ALLOWED_ORIGINS: "*" },
])("rejects invalid deployment configuration: %j", (override) => {
  expect(() => getRelayEnvironment({ ...values, ...override })).toThrow(/Invalid|Production|Relay/);
});
