import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { copyPackageClosure, nodeArtifact } from "./prepare.js";

describe("desktop runner distribution", () => {
  it("selects a pinned executable for each shipped OS and rejects unsupported targets", () => {
    expect(nodeArtifact("darwin", "arm64")).toEqual({
      base: "node-v24.18.0-darwin-arm64",
      filename: "node-v24.18.0-darwin-arm64.tar.gz",
      executable: "bin/node",
    });
    expect(nodeArtifact("win32", "x64").executable).toBe("node.exe");
    expect(() => nodeArtifact("android", "arm64")).toThrow("Unsupported");
  });
  it("copies SDK resources and retains conflicting installed dependency versions", async () => {
    const root = await mkdtemp(join(tmpdir(), "voidmix-runner-"));
    const makePackage = async (
      path: string,
      name: string,
      version: string,
      dependencies: Record<string, string> = {},
    ) => {
      await mkdir(path, { recursive: true });
      await writeFile(join(path, "package.json"), JSON.stringify({ name, version, dependencies }));
      await writeFile(join(path, "resource.wasm"), name);
    };
    try {
      const modules = join(root, "source/node_modules");
      const sdk = join(modules, "sdk");
      await makePackage(sdk, "sdk", "1.0.0", { shared: "1", plugin: "1" });
      await makePackage(join(modules, "shared"), "shared", "1.0.0");
      await makePackage(join(modules, "plugin"), "plugin", "1.0.0", { shared: "2" });
      await makePackage(join(modules, "plugin/node_modules/shared"), "shared", "2.0.0");
      const output = join(root, "output/node_modules");
      await copyPackageClosure(sdk, output);
      expect(await readFile(join(output, "sdk/resource.wasm"), "utf8")).toBe("sdk");
      expect(JSON.parse(await readFile(join(output, "shared/package.json"), "utf8")).version).toBe(
        "1.0.0",
      );
      expect(
        JSON.parse(await readFile(join(output, "plugin/node_modules/shared/package.json"), "utf8"))
          .version,
      ).toBe("2.0.0");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
