import { cp, mkdir, readFile, readdir, chmod, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { spawnProcess } from "@raypx/runtime-node/process";
import { extractArchive } from "./archive.ts";

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
async function download(url: string, hash: string, algorithm = "sha256") {
  const response = await fetch(url);
  if (!response.ok) throw new Error("CLI runtime download failed");
  const bytes = Buffer.from(await response.arrayBuffer());
  const encoding = algorithm === "sha512" ? "base64" : "hex";
  if (createHash(algorithm).update(bytes).digest(encoding) !== hash)
    throw new Error("CLI runtime checksum mismatch");
  return bytes;
}
async function npmPackage(name: string, version: string, directory: string) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`);
  if (!response.ok) throw new Error("Package metadata unavailable");
  const metadata = (await response.json()) as { dist: { tarball: string; integrity: string } };
  const [algorithm, hash] = metadata.dist.integrity.split("-");
  if (algorithm !== "sha512" || !hash) throw new Error("Unsupported package integrity");
  const archive = directory + ".tgz";
  await mkdir(directory, { recursive: true });
  await writeFile(archive, await download(metadata.dist.tarball, hash, algorithm));
  await extractArchive(archive, directory, 1);
}
export async function packageCli(root: string, output: string, builtAt: number) {
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const version = JSON.parse(await readFile(join(root, "apps/cli/package.json"), "utf8"))
    .version as string;
  const nodeVersion = manifest.engines.node as string,
    pnpmVersion = manifest.packageManager.slice(5) as string;
  if (process.versions.node !== nodeVersion)
    throw new Error(`Build the CLI with Node ${nodeVersion}`);
  const platform = process.platform,
    arch = process.arch;
  if (!["linux", "darwin", "win32"].includes(platform) || !["x64", "arm64"].includes(arch))
    throw new Error("Unsupported CLI target");
  const cache = join(
    root,
    ".cache/runtime",
    `${platform}-${arch}-node${nodeVersion}-pnpm${pnpmVersion}`,
  );
  const runtime = join(cache, "runtime");
  const executable = platform === "win32" ? "node.exe" : "node";
  if (
    !existsSync(join(runtime, "pnpm", "LICENSE")) ||
    !existsSync(join(runtime, "pnpm", "pnpm" + (platform === "win32" ? ".exe" : "")))
  ) {
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
    const pnpm = join(runtime, "pnpm");
    await npmPackage("pnpm", pnpmVersion, pnpm);
    const native = join(cache, "pnpm-native");
    await npmPackage(`@pnpm/exe.${platform}-${arch}`, pnpmVersion, native);
    await cp(join(native, "LICENSE"), join(pnpm, "LICENSE"));
    const pnpmExe = "pnpm" + (platform === "win32" ? ".exe" : "");
    await cp(join(native, pnpmExe), join(pnpm, pnpmExe));
    await cp(join(native, pnpmExe), join(pnpm, "pnpx" + (platform === "win32" ? ".exe" : "")));
    if (platform !== "win32") {
      await chmod(join(runtime, executable), 0o755);
      await chmod(join(pnpm, "pnpm"), 0o755);
      await chmod(join(pnpm, "pnpx"), 0o755);
    }
  }
  await cp(runtime, join(output, "runtime"), { recursive: true });
  await cp(join(root, "LICENSE"), join(output, "RAYPX-LICENSE"));
  await run(["cargo", "build", "--locked", "--release", "--package", "raypx-launcher"], root);
  const launcher = "raypx" + (platform === "win32" ? ".exe" : "");
  await cp(join(root, "target/release", launcher), join(output, launcher));
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
    JSON.stringify({ version, builtAt, nodeVersion, pnpmVersion, files }, null, 2) + "\n",
  );
}
