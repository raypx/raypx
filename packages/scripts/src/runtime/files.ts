import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function walkFiles(
  root: string,
  directory: string,
  accept: (name: string) => boolean,
  found: string[],
  skippedDirectories: ReadonlySet<string>,
): Promise<void> {
  const absolute = join(root, directory);
  let entries;
  try {
    entries = await readdir(absolute, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const child = join(directory, entry.name);
      if (
        skippedDirectories.has(entry.name) ||
        skippedDirectories.has(child.split("\\").join("/")) ||
        entry.name.startsWith(".")
      )
        continue;
      await walkFiles(root, child, accept, found, skippedDirectories);
      continue;
    }
    if (entry.isFile() && accept(entry.name)) {
      found.push(join(directory, entry.name));
    }
  }
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
