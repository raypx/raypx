import { chmod, readdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";

async function removeTree(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  });
  if (!entries) return;
  for (const entry of entries) {
    const file = join(directory, entry.name);
    if (entry.isSymbolicLink()) await unlink(file);
    else if (entry.isDirectory()) await removeTree(file);
    else {
      try {
        await unlink(file);
      } catch (error) {
        if (process.platform !== "win32" || (error as NodeJS.ErrnoException).code !== "EPERM")
          throw error;
        await chmod(file, 0o600);
        await unlink(file);
      }
    }
  }
  await rmdir(directory);
}

/** Remove an owned fixture without following Bun's Windows runtime junctions. */
export async function removeOwnedTemporaryDirectory(directory: string): Promise<void> {
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
