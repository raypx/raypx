import { readdir, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

async function detachLinks(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) await unlink(path);
    else if (entry.isDirectory()) await detachLinks(path);
  }
}

/** Remove an owned fixture without traversing Windows runtime junctions. */
export async function removeTemporaryDirectory(directory: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      // Detach before recursive removal makes in-fixture targets dangling.
      await detachLinks(directory);
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || !["EBUSY", "EPERM", "ENOTEMPTY", "EACCES"].includes(code ?? ""))
        throw error;
      await Bun.sleep(100 + attempt * 50);
    }
  }
}
