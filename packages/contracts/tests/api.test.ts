import { describe, expect, it } from "vite-plus/test";
import { accountProfileSchema, apiContract } from "../src/api.js";

describe("foundation contract", () => {
  it("exposes scoped coordination without publishing local execution methods", () => {
    expect(Object.keys(apiContract)).toEqual([
      "configuration",
      "devices",
      "tasks",
      "approvals",
      "relay",
      "account",
    ]);
    expect(apiContract).not.toHaveProperty("terminal");
    expect(apiContract).not.toHaveProperty("files");
    expect(apiContract).not.toHaveProperty("agents");
    expect(Object.keys(apiContract.account)).toEqual(["get"]);
  });

  it("uses Better Auth's name and strips private fields", () => {
    expect(
      accountProfileSchema.parse({ id: "u1", email: "a@example.com", name: "A", token: "secret" }),
    ).toEqual({ id: "u1", email: "a@example.com", name: "A" });
  });
});
