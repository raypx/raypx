import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { findExecutable, spawnProcess } from "@raypx/runtime-node/process";

/** Install the real tarball with scripts disabled, then exercise the package manager's bin shim. */
export async function installNpmCli(directory: string) {
  const npm = findExecutable("npm");
  assert.ok(npm, "npm is required for package installation acceptance");
  async function run(args: string[]) {
    const child = spawnProcess([npm!, ...args], {
      cwd: directory,
      env: { ...process.env, npm_config_cache: join(directory, "npm-cache") },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    assert.equal(code, 0, `npm package acceptance failed: ${stderr}`);
    return stdout;
  }
  const source = resolve(import.meta.dirname, "../../dist");
  const [packed] = JSON.parse(
    await run(["pack", source, "--ignore-scripts", "--json", "--pack-destination", directory]),
  ) as { filename: string }[];
  assert.ok(packed?.filename);
  const installed = join(directory, "npm-installation");
  await run([
    "install",
    "--prefix",
    installed,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    join(directory, packed.filename),
  ]);
  const root = join(installed, "node_modules/@raypx/cli");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(manifest.bin.raypx, "./main.mjs");
  assert.equal(manifest.dependencies, undefined);
  assert.equal(manifest.scripts, undefined);
  assert.equal(manifest.private, undefined);
  const nodeOnly = join(directory, "node-only");
  await mkdir(nodeOnly);
  const node = join(nodeOnly, process.platform === "win32" ? "node.exe" : "node");
  if (process.platform === "win32") await copyFile(process.execPath, node);
  else await symlink(process.execPath, node);
  const shim = join(
    installed,
    "node_modules/.bin",
    process.platform === "win32" ? "raypx.cmd" : "raypx",
  );
  const version = spawnProcess([shim, "--version"], {
    cwd: directory,
    env: { ...process.env, PATH: nodeOnly },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(version.stdout).text(),
    new Response(version.stderr).text(),
    version.exited,
  ]);
  assert.equal(code, 0, stderr);
  assert.equal(stdout.trim(), manifest.version);
  return root;
}
