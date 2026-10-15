import { describe, expect, it } from "vite-plus/test";
import { accountProfileSchema, apiContract } from "./api.js";
describe("foundation contract", () => {
  it("exposes only account.get", () => {
    expect(Object.keys(apiContract)).toEqual(["account"]);
    expect(Object.keys(apiContract.account)).toEqual(["get"]);
  });
  it("uses Better Auth's name and strips private fields", () => {
    expect(
      accountProfileSchema.parse({ id: "u1", email: "a@example.com", name: "A", token: "secret" }),
    ).toEqual({ id: "u1", email: "a@example.com", name: "A" });
  });
});
