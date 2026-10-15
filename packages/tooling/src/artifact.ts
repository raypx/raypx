import { cp, readlink, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

/** A relocated probe must not quietly copy dependencies from outside the artifact. */
export async function stageArtifact(source: string, destination: string) {
  const root = await realpath(source);
  async function validate(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const resolved = await realpath(path);
        const within = relative(root, resolved);
        if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
          throw new Error(`Artifact link escapes its output: ${relative(root, path)}`);
        if (isAbsolute(await readlink(path)))
          throw new Error(
            `Artifact link must be relative to survive relocation: ${relative(root, path)}`,
          );
      } else if (entry.isDirectory()) await validate(path);
    }
  }
  await validate(root);
  await cp(root, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
}
