import { expect, it } from "vite-plus/test";
import { affectedWorkspaces, changedFiles } from "./verification.js";
const members = [
  { name: "ui", dependencies: [] },
  { name: "desktop", dependencies: ["ui"] },
  { name: "cli", dependencies: ["desktop"] },
];
it("propagates scopes to a fixed point without promoting browser changes into native consumers", () => {
  type Scope = "browser" | "all";
  const result = affectedWorkspaces(members, new Map<string, Scope>([["ui", "browser"]]), {
    merge: (before, next) => (before === "all" ? before : next),
    propagate: (scope, _, consumer) =>
      scope === "browser" && consumer.name === "cli" ? undefined : scope,
  });
  expect([...result]).toEqual([
    ["ui", "browser"],
    ["desktop", "browser"],
  ]);
  expect(() =>
    affectedWorkspaces(members, new Map([["missing", true]]), {
      merge: () => true,
      propagate: () => true,
    }),
  ).toThrow("Unknown affected workspace");
});
it("falls back to full verification when a Git base cannot be read", () => {
  expect(changedFiles(process.cwd(), "missing-verification-base").reasons.length).toBeGreaterThan(
    0,
  );
});
