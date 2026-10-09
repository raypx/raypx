import { expect, test } from "vite-plus/test";
import { healthResponseSchema, readinessResponseSchema } from "../src/health.js";

test("accepts the health response contract", () => {
  expect(healthResponseSchema.parse({ status: "ok", service: "raypx-api" })).toEqual({
    status: "ok",
    service: "raypx-api",
  });
});

test.each([
  {},
  { status: "ok" },
  { status: "error", service: "raypx-api" },
  { status: "ok", service: "other-service" },
  null,
])("rejects invalid health response %j", (payload) => {
  expect(healthResponseSchema.safeParse(payload).success).toBe(false);
});

test("validates dependency readiness independently from business errors", () => {
  const payload = { status: "unavailable", service: "raypx-api", checks: { database: "failed" } };
  expect(readinessResponseSchema.parse(payload)).toEqual(payload);
  expect(
    readinessResponseSchema.safeParse({ ...payload, checks: { database: "timeout" } }).success,
  ).toBe(false);
});
