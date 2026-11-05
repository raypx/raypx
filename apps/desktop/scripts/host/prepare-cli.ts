import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, lstat, readFile, cp, rename, rm } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute, sep } from "node:path";

async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Verify every file in a complete runtime, rejecting substitutions and stale resources. */
export async function verifyRuntime(source: string) {
  const manifest = JSON.parse(await readFile(join(source, "runtime.json"), "utf8")) as {
    files: Record<string, string>;
    version?: string;
    builtAt?: number;
    nodeVersion?: string;
    pnpmVersion?: string;
  };
  if (!manifest.files || typeof manifest.files !== "object")
    throw new Error("Incomplete CLI runtime");
  const found = new Set<string>();
  async function walk(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error("Unsafe CLI resource symlink");
      if (entry.isDirectory()) await walk(join(directory, entry.name), name + "/");
      else if (entry.isFile() && name !== "runtime.json") found.add(name);
      else if (!entry.isFile()) throw new Error("Unsupported CLI resource");
    }
  }
  if ((await lstat(source)).isSymbolicLink()) throw new Error("Unsafe CLI directory");
  await walk(source);
  if (found.size !== Object.keys(manifest.files).length)
    throw new Error("CLI resource inventory changed");
  for (const [name, hash] of Object.entries(manifest.files)) {
    const local = relative(source, resolve(source, name));
    if (
      isAbsolute(name) ||
      local === ".." ||
      local.startsWith(".." + sep) ||
      !found.has(name) ||
      (await digest(join(source, name))) !== hash
    )
      throw new Error("CLI resource checksum mismatch");
  }
  return manifest;
}

/** Stage the whole distribution so stale chunks cannot survive an upgrade. */
export async function stageRuntime(source: string, target: string): Promise<void> {
  await verifyRuntime(source);
  const temporary = target + "." + crypto.randomUUID() + ".tmp";
  await mkdir(dirname(target), { recursive: true });
  try {
    await cp(source, temporary, { recursive: true, errorOnExist: true, force: false });
    await rm(target, { force: true, recursive: true });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
