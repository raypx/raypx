import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checkToolchain, readNodePin, readPnpmPin } from "./toolchain.ts";
import { workspaceConfiguration } from "./workspaces.ts";
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
      engines: { node: "24.22.2" },
      devEngines: {
        runtime: { name: "node", version: "24.22.2", onFail: "error" },
        packageManager: { name: "pnpm", version: "12.16.1", onFail: "error" },
      },
    }),
  );
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["node"]\n',
  );
  writeFileSync(join(root, "rust-toolchain.toml"), '[toolchain]\nchannel = "1.99.1"\n');
  writeFileSync(join(root, "pnpm-workspace.yaml"), workspaceConfiguration(root));
  return root;
}
it("accepts distinct canonical Node, pnpm and Rust pins", () => {
  const root = repository();
  mkdirSync(join(root, "apps/api"), { recursive: true });
  writeFileSync(
    join(root, "apps/api/Dockerfile"),
    "ARG NODE_VERSION=24.22.2\nFROM node:${NODE_VERSION}-bookworm-slim AS runtime\n",
  );
  writeFileSync(join(root, "README.md"), "Use Node 24.22.2 and pnpm 12.16.1.\n");
  expect(readNodePin(root)).toBe("24.22.2");
  expect(readPnpmPin(root)).toBe("12.16.1");
  expect(checkToolchain(root, ["README.md"])).toEqual([]);
});
it("rejects drift, stale workspace catalogs and obsolete runtimes", () => {
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
    "Node image must use 24.22.2",
    "Bun and Go images are unsupported",
    "setup-node must read package.json",
    "obsolete runtime setup",
    "pnpm setup must read packageManager",
    "documented Node must use 24.22.2",
    "documented pnpm must use 12.16.1",
  ])
    expect(findings).toContain(expected);
});
