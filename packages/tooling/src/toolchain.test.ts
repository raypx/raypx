import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { checkToolchain, readToolchain } from "./toolchain.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function repository(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "raypx-toolchain-test-"));
  roots.push(root);
  const manifest = {
    packageManager: "bun@1.4.3",
    engines: { node: "24.15.0" },
    devEngines: {
      packageManager: { name: "bun", version: "1.4.3" },
      runtime: { name: "bun", version: "1.4.3" },
    },
    workspaces: { catalogs: { tooling: { "@types/bun": "1.4.3" } } },
  };
  const defaults: Record<string, string> = {
    ".nvmrc": "24.15.0\n",
    "package.json": JSON.stringify(manifest),
    "apps/api/Dockerfile": "FROM oven/bun:1.4.3 AS build\nFROM node:24.15.0-bookworm-slim\n",
    ".github/workflows/ci.yml":
      "steps:\n  - with:\n      node-version-file: .nvmrc\n  - with:\n      bun-version-file: package.json\n",
    "README.md": "Requires Bun 1.4.3 and Node 24.15.0.\n",
  };
  for (const [path, source] of Object.entries({ ...defaults, ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

describe("toolchain pins", () => {
  it("reads Node from .nvmrc and Bun from packageManager", () => {
    expect(readToolchain(repository({ ".nvmrc": "v24.15.0\n" }))).toEqual({
      node: "24.15.0",
      bun: "1.4.3",
    });
    expect(() => readToolchain(repository({ ".nvmrc": "lts/*\n" }))).toThrow(/exact versions/);
  });
  it("accepts a repository whose literal pins follow the sources", () => {
    expect(checkToolchain(repository({}), ["README.md"])).toEqual([]);
  });
  it("reports every pin that drifts from the sources", () => {
    const root = repository({
      ".nvmrc": "24.16.0\n",
      "apps/web/Dockerfile": "FROM node:24.15.0-bookworm-slim\n",
      ".github/workflows/ci.yml": "steps:\n  - with:\n      node-version: 24\n",
      "mise.toml":
        '[settings]\nidiomatic_version_file_enable_tools = ["node"]\n[tools]\nnode = "24"\n',
      ".tool-versions": "nodejs 24.15.0\n",
    });
    expect(checkToolchain(root, ["README.md"]).sort()).toEqual(
      [
        "package.json: engines.node is 24.15.0, expected 24.16.0",
        "apps/api/Dockerfile: node image is 24.15.0, expected 24.16.0",
        "apps/web/Dockerfile: node image is 24.15.0, expected 24.16.0",
        ".github/workflows/ci.yml: select Node with node-version-file: .nvmrc",
        "README.md: documented Node is 24.15.0, expected 24.16.0",
        "mise.toml: do not pin [tools]; mise reads .nvmrc and package.json",
        ".tool-versions: remove it; .nvmrc and package.json pin the toolchain",
      ].sort(),
    );
  });
});
