import { expect, it } from "vitest";
import { sandboxUpdateSchema } from "./config.js";

const values = { provider: "docker", url: "https://supervisor.example.test", screen: false };
it("admits only a root HTTP(S) origin and rejects embedded credentials and arbitrary fields", () => {
  for (const url of [
    "file:///tmp/supervisor",
    "unix:///var/run/docker.sock",
    "https://user:fake@example.test",
    "https://supervisor.example.test/path",
    "https://supervisor.example.test/?probe=1",
    "https://supervisor.example.test/#private",
  ])
    expect(sandboxUpdateSchema.safeParse({ values: { ...values, url }, revision: 0 }).success).toBe(
      false,
    );
  expect(
    sandboxUpdateSchema.parse({ values: { ...values, url: "http://127.0.0.1:4020/" }, revision: 0 })
      .values.url,
  ).toBe("http://127.0.0.1:4020");
  expect(sandboxUpdateSchema.safeParse({ values, revision: 0, environment: {} }).success).toBe(
    false,
  );
  expect(
    sandboxUpdateSchema.safeParse({ values: { ...values, url: null }, revision: 0 }).success,
  ).toBe(false);
  expect(
    sandboxUpdateSchema.safeParse({
      values: { ...values, provider: "none", url: null },
      revision: 0,
    }).success,
  ).toBe(true);
});
it("bounds write-only credentials and rejects header control characters", () => {
  for (const credential of ["short", "x".repeat(513), `${"x".repeat(32)}\r\nInjected: fake`])
    expect(sandboxUpdateSchema.safeParse({ values, credential, revision: 0 }).success).toBe(false);
});
