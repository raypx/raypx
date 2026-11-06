import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";

async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

/** Preserve the mtime of an unchanged staged CLI. */
export async function stageCli(source: string, target: string): Promise<boolean> {
  const sourceInfo = await stat(source);
  const targetInfo = await stat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  let unchanged = false;
  if (sourceInfo.size === targetInfo?.size) {
    const [sourceHash, targetHash] = await Promise.all([digest(source), digest(target)]);
    unchanged = sourceHash === targetHash;
  }
  if (!unchanged) {
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  if (process.platform !== "win32") await chmod(target, 0o755);
  return !unchanged;
}
