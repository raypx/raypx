import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { checkArchitecture } from "./repo/architecture.js";
import { discover } from "./repository.js";
import { scaffold } from "./scaffold.js";
import { workspaceFixtures } from "../tests/helpers/workspace.js";

const { fixture, member } = workspaceFixtures();

describe("workspace scaffolding", () => {
  it("discovers a scaffolded package without editing any central list and refuses overwrite", () => {
    const root = fixture();
    member(root, "task-graph", { metadata: { kind: "tooling", target: "node" } });
    member(root, "tsconfig");
    const preview = scaffold(root, "feature-kit", { kind: "library", target: "universal" });
    expect(preview).toContain("packages/feature-kit/src/index.ts");
    expect(discover(root).workspaces).toHaveLength(2);
    scaffold(root, "feature-kit", {
      kind: "library",
      target: "universal",
      tests: true,
      write: true,
    });
    expect(discover(root).byName.has("@raypx/feature-kit")).toBe(true);
    expect(checkArchitecture(discover(root))).toEqual([]);
    expect(readFileSync(join(root, "packages/feature-kit/package.json"), "utf8")).not.toContain(
      '"build"',
    );
    expect(
      JSON.parse(readFileSync(join(root, "packages/feature-kit/package.json"), "utf8"))
        .devDependencies,
    ).toEqual({ "@raypx/tsconfig": "workspace:*", "@raypx/task-graph": "workspace:*" });
    const scripts = JSON.parse(
      readFileSync(join(root, "packages/feature-kit/package.json"), "utf8"),
    ).scripts;
    expect(scripts.test).not.toContain("passWithNoTests");
    expect(scripts["test:integration"]).toBeUndefined();
    expect(scripts["test:component"]).toBeUndefined();
    expect(() =>
      scaffold(root, "feature-kit", { kind: "library", target: "universal", write: true }),
    ).toThrow("already exists");
    expect(() => scaffold(root, "../escape", { kind: "library", target: "universal" })).toThrow(
      "hyphenated",
    );
    expect(() => scaffold(root, "con", { kind: "library", target: "universal" })).toThrow(
      "reserved on Windows",
    );
    expect(() =>
      scaffold(root, "invalid-target", { kind: "library", target: "invalid" as never }),
    ).toThrow("Invalid workspace kind or target");
  });
});
