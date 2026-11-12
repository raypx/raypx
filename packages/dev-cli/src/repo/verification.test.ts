import { expect, it } from "vitest";
import { affectedWorkspaces, changedFiles } from "./verification.js";
const members = [
  { name: "cli", dependencies: ["desktop"] },
  { name: "desktop", dependencies: ["ui"] },
  { name: "ui", dependencies: [] },
  { name: "independent", dependencies: [] },
];
it("follows every transitive dependent independent of manifest order", () => {
  expect(affectedWorkspaces(members, new Set(["ui"]))).toEqual(new Set(["ui", "desktop", "cli"]));
  expect(() => affectedWorkspaces(members, new Set(["missing"]))).toThrow(
    "Unknown affected workspace",
  );
});
it("falls back to full verification when a Git base cannot be read", () => {
  expect(changedFiles(process.cwd(), "missing-verification-base").reasons.length).toBeGreaterThan(
    0,
  );
});
