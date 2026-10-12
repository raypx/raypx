import { cp, lstat, mkdtemp, readlink, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface RuntimeArtifactStage {
  cleanup(): Promise<void>;
  directory: string;
}

export function parseArtifactMetadata(
  raw: string,
  target: { name: string },
): { preset: string; serverEntry: string } {
  const metadata: unknown = JSON.parse(raw);
  if (!metadata || typeof metadata !== "object") {
    throw new Error(`${target.name} Nitro metadata must be an object.`);
  }

  const { preset, serverEntry } = metadata as Record<string, unknown>;
  if (preset !== "bun") {
    throw new Error(`${target.name} Nitro output uses ${String(preset)} instead of bun.`);
  }
  if (typeof serverEntry !== "string" || serverEntry.length === 0) {
    throw new Error(`${target.name} Nitro metadata is missing serverEntry.`);
  }
  return { preset, serverEntry };
}

function isWithinDirectory(directory: string, path: string): boolean {
  const relativePath = relative(directory, path);
  return relativePath !== ".." && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath);
}

export function resolveArtifactEntry(outputDirectory: string, serverEntry: string): string {
  const entry = resolve(outputDirectory, serverEntry);
  if (!isWithinDirectory(outputDirectory, entry)) {
    throw new Error(`Nitro serverEntry points outside its output directory: ${serverEntry}`);
  }
  return entry;
}

async function validateArtifactLinks(directory: string): Promise<void> {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error("Runtime artifact output must be a directory, not a symbolic link or file.");
  }
  const outputRoot = await realpath(directory);

  async function visit(currentDirectory: string): Promise<void> {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const path = join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isSymbolicLink()) {
        const target = await readlink(path);
        const linkName = relative(directory, path);
        if (isAbsolute(target)) {
          throw new Error(`Runtime artifact symlink must use a relative target: ${linkName}`);
        }
        if (!isWithinDirectory(directory, resolve(dirname(path), target))) {
          throw new Error(
            `Runtime artifact symlink points outside its output directory: ${linkName}`,
          );
        }

        let resolvedTarget: string;
        try {
          resolvedTarget = await realpath(path);
        } catch (error) {
          throw new Error(`Runtime artifact symlink cannot resolve: ${linkName}`, { cause: error });
        }
        if (!isWithinDirectory(outputRoot, resolvedTarget)) {
          throw new Error(
            `Runtime artifact symlink points outside its output directory: ${linkName}`,
          );
        }
      }
    }
  }

  await visit(directory);
}

export async function stageRuntimeArtifact(sourceDirectory: string): Promise<RuntimeArtifactStage> {
  const stagingRoot = await mkdtemp(join(tmpdir(), "raypx-runtime-artifact-"));
  const directory = join(stagingRoot, ".output");

  try {
    await cp(sourceDirectory, directory, {
      dereference: false,
      recursive: true,
      verbatimSymlinks: true,
    });
    await validateArtifactLinks(directory);
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    throw error;
  }

  return {
    directory,
    cleanup: () => rm(stagingRoot, { force: true, recursive: true }),
  };
}
