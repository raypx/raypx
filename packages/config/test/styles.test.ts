import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";
import { copyStyles } from "../src/styles.ts";

test("copies nested CSS and removes stale styles while preserving compiled JavaScript", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-styles-"));
  try {
    await mkdir(join(directory, "src/components"), { recursive: true });
    await mkdir(join(directory, "dist"), { recursive: true });
    await writeFile(join(directory, "src/components/button.css"), "button { color: red; }");
    await writeFile(join(directory, "dist/stale.css"), "old");
    await writeFile(join(directory, "dist/index.js"), "export {};");
    await copyStyles(directory);
    expect(await readFile(join(directory, "dist/components/button.css"), "utf8")).toContain(
      "color: red",
    );
    await expect(readFile(join(directory, "dist/stale.css"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(join(directory, "dist/index.js"), "utf8")).toBe("export {};");
    await rm(join(directory, "src/components/button.css"));
    await copyStyles(directory);
    await expect(readFile(join(directory, "dist/components/button.css"))).rejects.toMatchObject({
      code: "ENOENT",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Bun runs the CSS watcher while Node compiles declarations and removed directories are synchronized", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-bun-styles-"));
  let watcher: ChildProcess | undefined;
  let output = "";
  async function waitFor(condition: () => Promise<boolean>) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      if (watcher?.exitCode !== null || watcher?.signalCode !== null) {
        throw new Error(`Styles watcher exited: ${output}`);
      }
      if (await condition()) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Styles watcher did not synchronize: ${output}`);
  }
  async function contents(path: string) {
    return readFile(path, "utf8").catch(() => "");
  }
  try {
    await mkdir(join(directory, "src/components"), { recursive: true });
    await writeFile(join(directory, "src/components/button.css"), "button { color: red; }");
    await writeFile(join(directory, "src/index.ts"), "export const marker = 1;");
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          module: "NodeNext",
          target: "ES2022",
          rootDir: "src",
          outDir: "dist",
          declaration: true,
          types: [],
        },
        include: ["src"],
      }),
    );
    watcher = spawn(
      "bun",
      [fileURLToPath(new URL("../src/styles.ts", import.meta.url)), "--watch"],
      {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    watcher.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    watcher.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    await waitFor(async () =>
      (await contents(join(directory, "dist/index.d.ts"))).includes("marker"),
    );
    await waitFor(async () =>
      (await contents(join(directory, "dist/components/button.css"))).includes("color: red"),
    );
    await writeFile(join(directory, "src/components/button.css"), "button { color: blue; }");
    await waitFor(async () =>
      (await contents(join(directory, "dist/components/button.css"))).includes("color: blue"),
    );
    await rm(join(directory, "src/components"), { recursive: true });
    await waitFor(
      async () => (await contents(join(directory, "dist/components/button.css"))) === "",
    );
    expect(await contents(join(directory, "dist/index.d.ts"))).toContain("marker");
  } finally {
    if (watcher && watcher.exitCode === null && watcher.signalCode === null) {
      const exited = once(watcher, "exit");
      watcher.kill("SIGTERM");
      const timeout = setTimeout(() => watcher?.kill("SIGKILL"), 3000);
      try {
        await exited;
      } finally {
        clearTimeout(timeout);
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
