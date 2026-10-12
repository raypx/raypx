import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { sourceImportViolations } from "../architecture/model.ts";
import { loadArchitectureIndex } from "./runtime.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("architecture lint metadata", () => {
  it("resolves root workspace globs, manifests and both aliases from disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "raypx-boundaries-"));
    roots.push(root);
    const files: Record<string, object> = {
      "package.json": { workspaces: { packages: ["apps/*", "packages/*", "e2e"] } },
      "apps/web/package.json": {
        name: "web",
        dependencies: { "@raypx/db": "*" },
        imports: { "#db/*": "../../packages/db/src/*" },
      },
      "apps/web/tsconfig.json": {
        compilerOptions: { paths: { "@db/*": ["../../packages/db/src/*"] } },
      },
      "packages/db/package.json": { name: "@raypx/db", exports: { ".": "./src/index.ts" } },
      "e2e/package.json": { name: "@raypx/e2e" },
    };
    await Promise.all(
      Object.entries(files).map(async ([path, value]) => {
        await mkdir(join(root, path, ".."), { recursive: true });
        await writeFile(join(root, path), JSON.stringify(value));
      }),
    );
    const index = loadArchitectureIndex(root);
    expect(index.workspaces.map((workspace) => workspace.path)).toEqual([
      "apps/web",
      "e2e",
      "packages/db",
    ]);
    for (const request of ["#db/index.ts", "@db/index.ts"])
      expect(sourceImportViolations(index, "apps/web/src/index.ts", request)).toEqual([
        `private cross-package import: ${request}`,
        `forbidden runtime dependency: ${request}`,
      ]);
  });
});
