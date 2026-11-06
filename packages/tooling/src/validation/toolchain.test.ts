import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { assertNodeVersion, checkToolchain, readNodeRange, readPnpmPin } from "./toolchain.ts";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";

const { fixture } = workspaceFixtures();
function repository() {
  const root = fixture();
  const base = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      ...base,
      packageManager: "pnpm@12.16.1",
      engines: { node: ">=24.18.0 <25" },
      devEngines: {
        runtime: { name: "node", version: ">=24.18.0 <25", onFail: "error" },
        packageManager: { name: "pnpm", version: "12.16.1", onFail: "error" },
      },
    }),
  );
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["node"]\n',
  );
  writeFileSync(join(root, "rust-toolchain.toml"), '[toolchain]\nchannel = "1.99.1"\n');
  return root;
}
it.each(["24.18.0", "24.22.2", "24.99.0"])(
  "accepts supported Node %s with pinned pnpm and Rust",
  (version) => {
    const root = repository();
    mkdirSync(join(root, "apps/api"), { recursive: true });
    writeFileSync(
      join(root, "apps/api/Dockerfile"),
      `ARG NODE_VERSION=${version}\nFROM node:\${NODE_VERSION}-bookworm-slim AS runtime\n`,
    );
    writeFileSync(join(root, "README.md"), `Use Node ${version} and pnpm 12.16.1.\n`);
    expect(readNodeRange(root)).toBe(">=24.18.0 <25");
    expect(() => assertNodeVersion(root, version)).not.toThrow();
    expect(readPnpmPin(root)).toBe("12.16.1");
    expect(checkToolchain(root, ["README.md"])).toEqual([]);
  },
);
it.each(["24.17.9", "25.0.0", "26.0.0", "24.22.2-rc.1"])(
  "rejects unsupported Node %s",
  (version) => {
    const root = repository();
    expect(() => assertNodeVersion(root, version)).toThrow(
      `Expected Node >=24.18.0 <25, got ${version}`,
    );
    mkdirSync(join(root, "apps/api"), { recursive: true });
    writeFileSync(join(root, "apps/api/Dockerfile"), `ARG NODE_VERSION=${version}\n`);
    expect(checkToolchain(root, [])).toContain(
      "apps/api/Dockerfile: Node image must satisfy >=24.18.0 <25",
    );
  },
);
it("rejects an invalid Node range and mismatched install constraints", () => {
  const root = repository();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  manifest.devEngines.runtime.version = "24.22.2";
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  expect(checkToolchain(root, [])).toContain(
    "package.json: devEngines.runtime must require node@>=24.18.0 <25",
  );
  manifest.engines.node = "invalid";
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  expect(checkToolchain(root, [])).toEqual([
    "Declare a valid Node version range in package.json engines.node",
  ]);
});
it("rejects invalid workspace configuration and obsolete runtimes", () => {
  const root = repository();
  writeFileSync(join(root, "bun.lock"), "obsolete");
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []");
  mkdirSync(join(root, "apps/web"), { recursive: true });
  writeFileSync(
    join(root, "apps/web/Dockerfile"),
    "ARG NODE_VERSION=24.15.0\nFROM node:${NODE_VERSION}-bookworm\nFROM golang:1.27 AS legacy\n",
  );
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    join(root, ".github/workflows/ci.yml"),
    "jobs:\n  build:\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 22\n      - uses: oven-sh/setup-bun@v2\n      - uses: pnpm/action-setup@v5\n        with:\n          version: 12.0.0\n",
  );
  writeFileSync(join(root, "README.md"), "Node 24.15.0, pnpm 12.0.0.\n");
  const findings = checkToolchain(root, ["README.md"]).join("\n");
  for (const expected of [
    "pnpm-workspace.yaml",
    "bun.lock",
    "Node image must satisfy >=24.18.0 <25",
    "Bun and Go images are unsupported",
    "setup-node must read package.json",
    "obsolete runtime setup",
    "pnpm setup must read packageManager",
    "documented Node must satisfy >=24.18.0 <25",
    "documented pnpm must use 12.16.1",
  ])
    expect(findings).toContain(expected);
});

it("accepts directly maintained workspace YAML and rejects duplicate manifest configuration", () => {
  const root = repository();
  writeFileSync(
    join(root, "pnpm-workspace.yaml"),
    "# Maintained directly.\nengineStrict: true\npackages:\n  - packages/*\n",
  );
  expect(checkToolchain(root, [])).toEqual([]);
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  manifest.workspaces = ["packages/*"];
  manifest.overrides = {};
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  expect(checkToolchain(root, [])).toEqual([
    "package.json: move workspaces to pnpm-workspace.yaml",
    "package.json: move overrides to pnpm-workspace.yaml",
  ]);
});
