import { healthResponseSchema } from "@raypx/contracts/health";
import { expect, test } from "vite-plus/test";
import { apiNotFoundResponse, healthResponse } from "../src/health.js";

test("health response matches the shared frontend contract", async () => {
  const response = healthResponse();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(healthResponseSchema.parse(await response.json()).status).toBe("ok");
});

test("unknown API response is JSON with a 404 status", async () => {
  const response = apiNotFoundResponse();
  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "Not found" });
});
