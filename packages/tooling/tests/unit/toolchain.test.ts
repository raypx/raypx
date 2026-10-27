import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { checkToolchain, readBunPin } from "../../src/validation/toolchain.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture } = workspaceFixtures();
const engine = { name: "bun", version: "1.4.4", onFail: "error" };

function repository(manifest: Record<string, unknown> = {}) {
  const root = fixture();
  const base = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      ...base,
      packageManager: "bun@1.4.4",
      devEngines: { packageManager: engine, runtime: engine },
      ...manifest,
    }),
  );
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["bun"]\n',
  );
  return root;
}

it("accepts a repository whose only runtime pin is the Bun packageManager", () => {
  const root = repository();
  mkdirSync(join(root, "apps/api"), { recursive: true });
  writeFileSync(join(root, "apps/api/Dockerfile"), "FROM oven/bun:1.4.4-slim AS runtime\n");
  writeFileSync(join(root, "README.md"), "Use Bun 1.4.4.\n");
  expect(readBunPin(root)).toBe("1.4.4");
  expect(checkToolchain(root, ["README.md"])).toEqual([]);
});

it("rejects reintroduced Node pins, images, CI setup and documented releases", () => {
  const root = repository({ engines: { node: "24.15.0" } });
  writeFileSync(join(root, ".nvmrc"), "24.15.0\n");
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["node", "bun"]\n',
  );
  mkdirSync(join(root, "apps/web"), { recursive: true });
  writeFileSync(join(root, "apps/web/Dockerfile"), "FROM node:24.15.0-bookworm-slim\n");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(
    join(root, ".github/workflows/ci.yml"),
    "jobs:\n  build:\n    steps:\n      - uses: actions/setup-node@v7\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: 1.4.4\n",
  );
  writeFileSync(join(root, "README.md"), "Use Bun 1.4.3 and Node 24.15.0.\n");
  const findings = checkToolchain(root, ["README.md"]).join("\n");
  for (const expected of [
    "package.json: remove engines.node",
    ".nvmrc: package.json packageManager is the only runtime pin",
    "mise.toml: enable idiomatic version files for bun only",
    "apps/web/Dockerfile: build and run on oven/bun images",
    ".github/workflows/ci.yml: remove actions/setup-node",
    ".github/workflows/ci.yml: read bun-version-file: package.json",
    "README.md: documented Bun is 1.4.3, expected 1.4.4",
    "README.md: documents a Node release",
  ])
    expect(findings).toContain(expected);
});
