import { cp, mkdir, readFile, readdir, chmod, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnProcess } from "@raypx/runtime-node/process";
import { extractArchive } from "./archive.ts";
import { assertNodeVersion } from "../validation/toolchain.ts";

async function run(command: string[], cwd: string, env = process.env) {
  const process = spawnProcess(command, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await process.exited) !== 0) throw new Error("CLI resource preparation failed");
}
async function download(url: string, hash: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("CLI runtime download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== hash)
    throw new Error("CLI runtime checksum mismatch");
  return bytes;
}
export async function packageCliRuntime(root: string, output: string, builtAt: number) {
  const nodeVersion = process.versions.node;
  assertNodeVersion(root, nodeVersion);
  const version = JSON.parse(await readFile(join(root, "apps/cli/package.json"), "utf8"))
    .version as string;
  const platform = process.platform,
    arch = process.arch;
  if (!["linux", "darwin", "win32"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new Error("Unsupported CLI target");
  const cache = join(root, ".cache/runtime", `${platform}-${arch}-node${nodeVersion}`);
  const runtime = join(cache, "runtime");
  const executable = platform === "win32" ? "node.exe" : "node";
  if (!existsSync(join(runtime, "NODE-LICENSE")) || !existsSync(join(runtime, executable))) {
    await mkdir(runtime, { recursive: true });
    const base = `https://nodejs.org/dist/v${nodeVersion}/`;
    const name = `node-v${nodeVersion}-${platform === "win32" ? "win" : platform}-${arch}`;
    const archive = name + (platform === "win32" ? ".zip" : ".tar.xz");
    const checksums = await (await fetch(base + "SHASUMS256.txt")).text();
    const hash = checksums
      .split("\n")
      .find((line) => line.endsWith(" " + archive))
      ?.trim()
      .split(/\s+/)[0];
    if (!hash) throw new Error("Node release checksum unavailable");
    const file = join(cache, archive);
    await writeFile(file, await download(base + archive, hash));
    await extractArchive(file, cache);
    await cp(
      join(cache, name, platform === "win32" ? executable : "bin/node"),
      join(runtime, executable),
    );
    await cp(join(cache, name, "LICENSE"), join(runtime, "NODE-LICENSE"));
    if (platform !== "win32") await chmod(join(runtime, executable), 0o755);
  }
  await rm(join(output, "runtime"), { recursive: true, force: true });
  await cp(runtime, join(output, "runtime"), { recursive: true });
  await cp(join(root, "LICENSE"), join(output, "RAYPX-LICENSE"));
  await run(["cargo", "build", "--locked", "--release", "--package", "raypx-launcher"], root);
  const launcher = "raypx" + (platform === "win32" ? ".exe" : "");
  await cp(join(root, "target/release", launcher), join(output, launcher));
  const herdr = join(output, "herdr");
  const hostHerdr = join(herdr, `${platform}-${arch}`);
  if (existsSync(hostHerdr)) {
    const temporary = join(output, "herdr-host");
    await rename(hostHerdr, temporary);
    await rm(herdr, { recursive: true });
    await rename(temporary, herdr);
  }
  await run(
    [
      process.execPath,
      "--import",
      import.meta.resolve("tsx"),
      join(root, "apps/cli/scripts/prepare-herdr.ts"),
      join(output, "herdr"),
    ],
    root,
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
    }
  }
  await walk(output);
  await writeFile(
    join(output, "runtime.json"),
    JSON.stringify({ version, builtAt, nodeVersion, files }, null, 2) + "\n",
  );
}
