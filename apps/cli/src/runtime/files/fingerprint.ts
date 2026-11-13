import { createHash } from "node:crypto";
import { lstat, opendir, realpath } from "node:fs/promises";
import { join, relative } from "node:path";
import { LocalError } from "../errors.js";
import type { FileRuntime } from "./index.js";

const ignoredDirectories = new Set([".git", "node_modules"]);
const maxEntries = 20_000;
const maxSnapshotBytes = 8 * 1024 * 1024;

/** Compare names and versions without reading or uploading file contents. */
export async function fileFingerprint(
  files: FileRuntime,
  rootId: string,
  path: string,
  signal: AbortSignal,
) {
  const root = await files.resolve(rootId, "");
  if (path.split("/").some((part) => ignoredDirectories.has(part.toLowerCase())))
    throw new LocalError(
      "INVALID_PATH",
      "Repository metadata and dependencies are excluded from file watches",
    );
  let target: string;
  try {
    target = await files.resolve(rootId, path);
  } catch (error) {
    if (!path || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await files.resolve(rootId, "");
    return "missing";
  }
  const pending = [target];
  const entries: string[] = [];
  let visited = 0;
  let bytes = 0;
  function record(value: unknown) {
    const entry = JSON.stringify(value);
    bytes += Buffer.byteLength(entry);
    if (bytes > maxSnapshotBytes)
      throw new LocalError("WATCH_LIMIT", "File watch snapshot is too large");
    entries.push(entry);
  }
  while (pending.length) {
    signal.throwIfAborted();
    const file = pending.pop()!;
    if ((await realpath(file)) !== file) {
      if ((await lstat(file)).isSymbolicLink() && file !== target) continue;
      throw new LocalError("SYMLINK", "Watched path changed");
    }
    const stat = await lstat(file, { bigint: true });
    const name = relative(root, file)
      .split(process.platform === "win32" ? "\\" : "/")
      .join("/");
    if (stat.isFile()) {
      record([
        name,
        stat.ino.toString(),
        stat.size.toString(),
        stat.mtimeNs.toString(),
        stat.ctimeNs.toString(),
      ]);
    } else if (stat.isDirectory()) {
      if (ignoredDirectories.has(name.split("/").at(-1)?.toLowerCase() ?? "")) continue;
      record([name]);
      const children = await opendir(file);
      for await (const child of children) {
        signal.throwIfAborted();
        if (++visited > maxEntries)
          throw new LocalError("WATCH_LIMIT", "Watch exceeds 20000 entries");
        if (
          !child.isSymbolicLink() &&
          !(child.isDirectory() && ignoredDirectories.has(child.name.toLowerCase()))
        )
          pending.push(join(file, child.name));
      }
      if ((await realpath(file)) !== file)
        throw new LocalError("SYMLINK", "Watched directory changed");
    }
  }
  await files.resolve(rootId, path);
  return createHash("sha256").update(JSON.stringify(entries.sort())).digest("hex");
}
