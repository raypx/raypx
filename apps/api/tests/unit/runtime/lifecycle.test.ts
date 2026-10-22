import { expect, it } from "vite-plus/test";
import { createLifecycle } from "../../../server/runtime/lifecycle.js";

it("closes in reverse order, attempts every resource and reports the first failure", async () => {
  const lifecycle = createLifecycle();
  const closed: string[] = [];
  lifecycle.own(async () => closed.push("logger"));
  lifecycle.own(async () => {
    closed.push("redis");
    throw new Error("redis");
  });
  lifecycle.own(async () => {
    closed.push("database");
    throw new Error("database");
  });
  await expect(lifecycle.close()).rejects.toThrow("database");
  expect(closed).toEqual(["database", "redis", "logger"]);
  // Closing twice is a no-op, as Nitro and tests may both close a runtime.
  await expect(lifecycle.close()).resolves.toBeUndefined();
  expect(closed).toHaveLength(3);
});
