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
      if (skippedDirectories.has(entry.name) || entry.name.startsWith(".")) continue;
      await walkFiles(root, join(directory, entry.name), accept, found, skippedDirectories);
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
