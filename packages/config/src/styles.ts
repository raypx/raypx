import { spawn } from "node:child_process";
import { copyFile, mkdir, readdir, unlink } from "node:fs/promises";
import { watch } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

async function cssFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await cssFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".css")) files.push(path);
  }
  return files;
}

export async function copyStyles(directory = process.cwd()): Promise<void> {
  const source = join(directory, "src");
  const output = join(directory, "dist");
  const files = await cssFiles(source);
  const expected = new Set(files.map((file) => join(output, relative(source, file))));
  for (const file of await cssFiles(output)) {
    if (!expected.has(file))
      await unlink(file).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
  }
  for (const file of files) {
    const target = join(output, relative(source, file));
    await mkdir(dirname(target), { recursive: true });
    await copyFile(file, target);
  }
}

async function watchStyles(directory: string): Promise<void> {
  await copyStyles(directory);
  let update = Promise.resolve();
  const watcher = watch(join(directory, "src"), { recursive: true }, (event, filename) => {
    if (event !== "rename" && filename && !filename.endsWith(".css")) return;
    update = update
      .then(() => copyStyles(directory))
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  });
  // Keep the compiler on Node even when Bun executes this workspace utility.
  const compilerPath = createRequire(import.meta.url).resolve("typescript/bin/tsc");
  const compiler = spawn("node", [compilerPath, "--watch", "--preserveWatchOutput"], {
    cwd: directory,
    stdio: "inherit",
  });
  const stop = (signal: NodeJS.Signals) => {
    watcher.close();
    compiler.kill(signal);
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));
  compiler.once("error", (error) => {
    watcher.close();
    console.error(error);
    process.exitCode = 1;
  });
  compiler.once("exit", (code) => {
    watcher.close();
    process.exitCode = code ?? 0;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--watch") await watchStyles(process.cwd());
  else if (process.argv[2] === "--copy") await copyStyles(process.cwd());
  else throw new Error("Usage: styles.ts --copy | --watch");
}
