import { createHash } from "node:crypto";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface CliPayload {
  format: 2;
  commit: string;
  platform: string;
  arch: string;
  version: string;
  builtAt: number;
  bunVersion: string;
  files: Record<string, string>;
}

export async function payloadFiles(directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  async function walk(path: string, prefix = "") {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const name = prefix + entry.name;
      if (!prefix && name === "runtime.json") continue;
      if (entry.isDirectory()) await walk(join(path, entry.name), name + "/");
      else if (entry.isFile())
        files[name] = createHash("sha256")
          .update(await readFile(join(path, entry.name)))
          .digest("hex");
      else throw new Error("CLI payload must contain only regular files and directories");
    }
  }
  await walk(directory);
  return files;
}

/** Re-inventory after signing, preserving the identity embedded at compilation. */
export async function sealCliPayload(directory: string, identity?: Omit<CliPayload, "files">) {
  const metadata =
    identity ?? (JSON.parse(await readFile(join(directory, "runtime.json"), "utf8")) as CliPayload);
  const manifest: CliPayload = { ...metadata, files: await payloadFiles(directory) };
  await writeFile(join(directory, "runtime.json"), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

/** Consumers validate before staging; this function never builds or downloads. */
export async function verifyCliPayload(
  directory: string,
  expected: Partial<Omit<CliPayload, "files">> = {},
) {
  if (!(await lstat(directory)).isDirectory())
    throw new Error("CLI payload directory is unavailable");
  if (!(await lstat(join(directory, "runtime.json"))).isFile())
    throw new Error("CLI payload manifest must be a regular file");
  const manifest = JSON.parse(
    await readFile(join(directory, "runtime.json"), "utf8"),
  ) as CliPayload;
  if (
    manifest.format !== 2 ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    !Number.isSafeInteger(manifest.builtAt) ||
    manifest.builtAt <= 0 ||
    ![manifest.version, manifest.bunVersion, manifest.platform, manifest.arch].every(
      (value) => typeof value === "string" && value.length > 0,
    ) ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    throw new Error("Unsupported CLI payload manifest");
  for (const [key, value] of Object.entries(expected))
    if (manifest[key as keyof CliPayload] !== value) throw new Error(`CLI payload ${key} mismatch`);
  const files = await payloadFiles(directory);
  const executable = manifest.platform === "win32" ? "raypx.exe" : "raypx";
  for (const name of [executable, "LICENSE", "README.txt"])
    if (!manifest.files[name]) throw new Error(`CLI payload missing ${name}`);
  const missing = Object.keys(manifest.files).filter((name) => !Object.hasOwn(files, name));
  const unexpected = Object.keys(files).filter((name) => !Object.hasOwn(manifest.files, name));
  if (missing.length || unexpected.length)
    throw new Error(`CLI payload inventory mismatch: ${JSON.stringify({ missing, unexpected })}`);
  for (const [name, hash] of Object.entries(manifest.files)) {
    const local = relative(directory, resolve(directory, name));
    if (
      isAbsolute(name) ||
      local === ".." ||
      local.startsWith(".." + sep) ||
      !/^[a-f0-9]{64}$/.test(hash) ||
      files[name] !== hash
    )
      throw new Error(`CLI payload integrity failure: ${name}`);
  }
  return manifest;
}
