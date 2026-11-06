import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "@raypx/runtime-node/process";
import { assertNodeVersion, readNodeRange } from "../validation/toolchain.ts";

/** Build the installable CLI package using the caller's Node runtime. */
export async function packageCli(root: string, output: string, builtAt: number) {
  assertNodeVersion(root, process.versions.node);
  const manifest = JSON.parse(await readFile(join(root, "apps/cli/package.json"), "utf8"));
  await Promise.all(
    Object.keys(manifest.herdr.assets).map(async (target) => {
      const [platform, arch] = target.split("-");
      const cache = join(root, ".cache/herdr", manifest.herdr.version, target);
      await run(
        process.execPath,
        [
          "--import",
          import.meta.resolve("tsx"),
          join(root, "apps/cli/scripts/prepare-herdr.ts"),
          cache,
          platform!,
          arch!,
        ],
        root,
      );
      await mkdir(join(output, "herdr"), { recursive: true });
      await cp(cache, join(output, "herdr", target), { recursive: true });
    }),
  );
  await cp(join(root, "LICENSE"), join(output, "LICENSE"));
  await cp(join(root, "apps/cli/README.md"), join(output, "README.md"));
  await chmod(join(output, "main.mjs"), 0o755);
  await writeFile(
    join(output, "package.json"),
    JSON.stringify(
      {
        name: "@raypx/cli",
        version: manifest.version,
        description: "Raypx local execution host and command-line interface",
        type: "module",
        bin: { raypx: "./main.mjs" },
        engines: { node: readNodeRange(root) },
        files: ["**/*"],
        publishConfig: { access: "public" },
      },
      null,
      2,
    ) + "\n",
  );

  const files: Record<string, string> = {};
  async function walk(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (!prefix && name === "runtime.json") continue;
      if (entry.isDirectory()) await walk(join(directory, entry.name), name + "/");
      else if (entry.isFile())
        files[name] = createHash("sha256")
          .update(await readFile(join(directory, entry.name)))
          .digest("hex");
      else throw new Error("Unsupported CLI resource");
    }
  }
  await walk(output);
  await writeFile(
    join(output, "runtime.json"),
    JSON.stringify(
      {
        version: manifest.version,
        builtAt,
        nodeVersion: process.versions.node,
        runtime: "system",
        files,
      },
      null,
      2,
    ) + "\n",
  );
}

export { packageCliRuntime } from "./cli-runtime.ts";
