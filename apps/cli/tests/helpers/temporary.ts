import { chmod, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

async function removeTree(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (!entries) return;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) await unlink(path);
    else if (entry.isDirectory()) await removeTree(path);
    else {
      try {
        await unlink(path);
      } catch (error) {
        if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM")
          throw error;
        // Windows refuses deletion of read-only files, including copied resources.
        await chmod(path, 0o600);
        await unlink(path);
      }
    }
  }
  await rmdir(directory);
}

/** Remove an owned fixture without traversing Windows runtime junctions. */
export async function removeTemporaryDirectory(directory: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await removeTree(directory);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || !["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(code ?? ""))
        throw error;
      await Bun.sleep(100 + attempt * 50);
    }
  }
}
