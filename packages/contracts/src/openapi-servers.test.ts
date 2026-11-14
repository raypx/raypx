import { expect, it } from "vitest";
import { openApiServerSchema, openApiSourceSchema } from "@raypx/core/openapi-servers";
import { apiContract, apiExposure } from "./api.js";
it("exposes additive session-bound API procedures to shared renderer clients", () => {
  for (const name of ["list", "create", "update", "delete", "test"]) {
    expect(apiContract.openApiServers).toHaveProperty(name);
    expect(apiExposure).toHaveProperty(`openApiServers.${name}`);
  }
});
it("accepts only one bounded document source and has no credential output field", () => {
  expect(openApiSourceSchema.safeParse({ document: "{}", url: "https://api.test" }).success).toBe(
    false,
  );
  expect(openApiSourceSchema.safeParse({ document: "x".repeat(262145) }).success).toBe(false);
  expect(Object.keys(openApiServerSchema.shape)).not.toContain("credential");
  expect(Object.keys(openApiServerSchema.shape)).not.toContain("secretId");
});
