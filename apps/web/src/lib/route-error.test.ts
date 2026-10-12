import { expect, it } from "vite-plus/test";
import { routeErrorAdapter } from "./route-error";

it("preserves the domain error code across SSR without exposing server details", () => {
  const error = Object.assign(new Error("private backend message"), {
    code: "FORBIDDEN",
    data: { error: { code: "PROJECT_ACCESS_DENIED" }, private: "server-only" },
  });
  expect(routeErrorAdapter.test(error)).toBe(true);
  const serialized = routeErrorAdapter.toSerializable(error);
  expect(serialized).toBe("PROJECT_ACCESS_DENIED");
  const hydrated = routeErrorAdapter.fromSerializable(serialized);
  expect(hydrated.code).toBe("PROJECT_ACCESS_DENIED");
  expect(hydrated.message).not.toContain("private");
  expect(hydrated).not.toHaveProperty("data");
  expect(hydrated).not.toHaveProperty("cause");
  expect(routeErrorAdapter.test(new Error("unrelated"))).toBe(false);
});
