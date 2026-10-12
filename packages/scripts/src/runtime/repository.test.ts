import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { repositoryRoot } from "./repository.js";

describe("repositoryRoot", () => {
  it("resolves the workspace root from the Scripts module location", async () => {
    const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8"));

    expect(manifest.workspaces).toBeDefined();
    await expect(access(join(repositoryRoot, "bun.lock"))).resolves.toBeUndefined();
    await expect(access(join(repositoryRoot, "packages/scripts"))).resolves.toBeUndefined();
  });
});
