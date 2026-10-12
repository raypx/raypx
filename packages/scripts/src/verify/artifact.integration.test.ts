import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it, onTestFinished } from "vite-plus/test";

import { parseArtifactMetadata, resolveArtifactEntry, stageRuntimeArtifact } from "./artifact.js";

const runFile = promisify(execFile);

async function artifactFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "raypx-artifact-test-"));
  onTestFinished(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function writeFixtureFile(root: string, path: string, content: string): Promise<void> {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function rejectedStageInIsolatedTemp(
  sourceDirectory: string,
  temporaryDirectory: string,
): Promise<{ message: string; remaining: string[] }> {
  await mkdir(temporaryDirectory, { recursive: true });
  const artifactUrl = pathToFileURL(fileURLToPath(new URL("./artifact.ts", import.meta.url))).href;
  const source = `
    import { readdir } from "node:fs/promises";
    import { stageRuntimeArtifact } from ${JSON.stringify(artifactUrl)};
    const [source, temporaryDirectory] = process.argv.slice(1);
    try {
      const stage = await stageRuntimeArtifact(source);
      await stage.cleanup();
      throw new Error("Expected artifact staging to fail");
    } catch (error) {
      console.log(JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        remaining: await readdir(temporaryDirectory),
      }));
    }
  `;
  const result = await runFile(
    process.execPath,
    ["--no-env-file", "--no-install", "--eval", source, sourceDirectory, temporaryDirectory],
    {
      env: {
        ...process.env,
        TEMP: temporaryDirectory,
        TMP: temporaryDirectory,
        TMPDIR: temporaryDirectory,
      },
      timeout: 5_000,
    },
  );
  return JSON.parse(result.stdout) as { message: string; remaining: string[] };
}

describe("runtime artifact relocation", () => {
  it("copies the complete artifact and preserves internal relative package links", async () => {
    const root = await artifactFixture();
    const sourceDirectory = join(root, "checkout", ".output");
    await writeFixtureFile(sourceDirectory, "nitro.json", '{"preset":"bun"}');
    await writeFixtureFile(sourceDirectory, "server/index.mjs", 'export const body = "ready";');
    await writeFixtureFile(sourceDirectory, "public/body.txt", "complete response body");
    await writeFixtureFile(sourceDirectory, "server/packages/sample/assets/template.txt", "asset");
    await mkdir(join(sourceDirectory, "server/node_modules"));
    await symlink("../packages/sample", join(sourceDirectory, "server/node_modules/sample"), "dir");
    await symlink(
      "template.txt",
      join(sourceDirectory, "server/packages/sample/assets/current.txt"),
    );

    const stage = await stageRuntimeArtifact(sourceDirectory);
    onTestFinished(() => stage.cleanup());
    expect(stage.directory.startsWith(root)).toBe(false);
    expect(await readlink(join(stage.directory, "server/node_modules/sample"))).toBe(
      "../packages/sample",
    );
    expect(await readlink(join(stage.directory, "server/packages/sample/assets/current.txt"))).toBe(
      "template.txt",
    );

    await rm(join(root, "checkout"), { force: true, recursive: true });
    expect(await readFile(join(stage.directory, "nitro.json"), "utf8")).toBe('{"preset":"bun"}');
    expect(await readFile(resolveArtifactEntry(stage.directory, "server/index.mjs"), "utf8")).toBe(
      'export const body = "ready";',
    );
    expect(await readFile(join(stage.directory, "public/body.txt"), "utf8")).toBe(
      "complete response body",
    );
    expect(
      await readFile(
        join(stage.directory, "server/node_modules/sample/assets/current.txt"),
        "utf8",
      ),
    ).toBe("asset");

    await stage.cleanup();
    await expect(access(dirname(stage.directory))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stage.cleanup()).resolves.toBeUndefined();
  });

  it.each(["relative", "absolute"] as const)(
    "rejects a %s link back to the checkout and cleans its own staging directory",
    async (kind) => {
      const root = await artifactFixture();
      const sourceDirectory = join(root, "checkout", ".output");
      const externalFile = join(root, "checkout", "dependency.txt");
      await writeFixtureFile(root, "checkout/dependency.txt", "must remain intact");
      await mkdir(sourceDirectory);
      await symlink(
        kind === "relative" ? "../dependency.txt" : externalFile,
        join(sourceDirectory, "dependency.txt"),
      );

      const result = await rejectedStageInIsolatedTemp(sourceDirectory, join(root, "staging"));
      expect(result.message).toContain(
        kind === "relative" ? "outside its output directory" : "must use a relative target",
      );
      expect(result.remaining).toEqual([]);
      expect(await readFile(externalFile, "utf8")).toBe("must remain intact");
      expect(await readlink(join(sourceDirectory, "dependency.txt"))).toBe(
        kind === "relative" ? "../dependency.txt" : externalFile,
      );
    },
  );

  it("cleans staging after a copy failure without removing neighboring user files", async () => {
    const root = await artifactFixture();
    await writeFixtureFile(root, "checkout/user.txt", "user content");

    const result = await rejectedStageInIsolatedTemp(
      join(root, "checkout", ".output"),
      join(root, "staging"),
    );
    expect(result.message).toContain("ENOENT");
    expect(result.remaining).toEqual([]);
    expect(await readFile(join(root, "checkout/user.txt"), "utf8")).toBe("user content");
  });

  it("rejects an escaped server entry and allows cleanup after caller validation fails", async () => {
    const root = await artifactFixture();
    await writeFixtureFile(root, ".output/server/index.mjs", "export {};");
    const stage = await stageRuntimeArtifact(join(root, ".output"));
    onTestFinished(() => stage.cleanup());

    try {
      expect(() => resolveArtifactEntry(stage.directory, "../../checkout/server.mjs")).toThrow(
        "Nitro serverEntry points outside its output directory: ../../checkout/server.mjs",
      );
      expect(resolveArtifactEntry(stage.directory, "..entry.mjs")).toBe(
        join(stage.directory, "..entry.mjs"),
      );
    } finally {
      await stage.cleanup();
    }
    await expect(access(dirname(stage.directory))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(root, ".output/server/index.mjs"), "utf8")).toBe("export {};");
  });
});

describe("artifact metadata", () => {
  it("accepts the Bun preset and entry shared by HTTP and Worker artifacts", () => {
    expect(
      parseArtifactMetadata('{"preset":"bun","serverEntry":"server/index.mjs"}', {
        name: "Worker",
      }),
    ).toEqual({ preset: "bun", serverEntry: "server/index.mjs" });
  });

  it.each([
    ["null", "Worker Nitro metadata must be an object."],
    ['{"preset":"node-server"}', "Worker Nitro output uses node-server instead of bun."],
    ['{"preset":"bun"}', "Worker Nitro metadata is missing serverEntry."],
  ])("rejects invalid metadata %s", (raw, message) => {
    expect(() => parseArtifactMetadata(raw, { name: "Worker" })).toThrow(message);
  });
});
