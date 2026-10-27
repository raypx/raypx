import { expect, it } from "vite-plus/test";
import { localParams, localRequestSchema } from "../src/local";
it("keeps local approval methods account-free and removes only the old private observed surface", () => {
  for (const method of ["approvals.local.settings", "approvals.local.list"] as const) {
    expect(localParams[method].safeParse({}).success).toBe(true);
    expect(localParams[method].safeParse({ apiUrl: "https://example.test" }).success).toBe(false);
    expect(localParams[method].safeParse({ accountId: "account" }).success).toBe(false);
  }
  for (const suffix of ["settings", "configure", "list", "get", "decide"])
    expect(
      localRequestSchema.safeParse({
        version: 1,
        id: "request",
        method: `observed.${suffix}`,
        params: {},
      }).success,
    ).toBe(false);
  expect(Object.hasOwn(localParams, "observed.remote")).toBe(true);
});
