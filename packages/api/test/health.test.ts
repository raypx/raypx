import { healthResponseSchema } from "@raypx/contracts/health";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { expect, test } from "vite-plus/test";
import { apiNotFoundResponse, healthResponse } from "../src/health.js";

test("health response matches the shared frontend contract", async () => {
  const response = healthResponse();
  expect(response.status).toBe(200);
  expect(healthResponseSchema.parse(await response.json()).status).toBe("ok");
});

test("unknown API paths return the public error contract", async () => {
  const response = apiNotFoundResponse();
  expect(response.status).toBe(404);
  expect(apiErrorResponseSchema.parse(await response.json()).error).toEqual({
    code: "NOT_FOUND",
    message: "Not found",
  });
});
