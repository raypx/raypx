import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";

interface CheckTask {
  taskId: string;
  hash: string;
  cache: { status: string };
}
interface RunSummary {
  tasks: CheckTask[];
}

it("invalidates downstream source checks through transit while retaining unrelated cache hits", () => {
  const resolveTurbo = createRequire(
    realpathSync(
      fileURLToPath(new URL("../../../../node_modules/turbo/bin/turbo", import.meta.url)),
    ),
  );
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const arch = process.arch === "x64" ? "64" : process.arch;
  const extension = process.platform === "win32" ? ".exe" : "";
  const turbo = resolveTurbo.resolve(`@turbo/${platform}-${arch}/bin/turbo${extension}`);
  const root = mkdtempSync(join(tmpdir(), "raypx-cache-regression-"));
  const run = (args: string[]) => {
    const child = Bun.spawnSync(args, {
      cwd: root,
      env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (child.exitCode !== 0)
      throw new Error(
        new TextDecoder().decode(child.stdout) + new TextDecoder().decode(child.stderr),
      );
  };
  const snapshot = (): Map<string, CheckTask> => {
    const directory = join(root, ".turbo/runs");
    let previous: string[] = [];
    try {
      previous = readdirSync(directory);
    } catch {
      /* First run has no summary directory. */
    }
    run([turbo, "run", "check", "--summarize", "--cache=local:rw"]);
    const files = readdirSync(directory).filter(
      (name) => name.endsWith(".json") && !previous.includes(name),
    );
    expect(files).toHaveLength(1);
    const summary = JSON.parse(readFileSync(join(directory, files[0]!), "utf8")) as RunSummary;
    return new Map(
      summary.tasks
        .filter((task) => task.taskId.endsWith("#check"))
        .map((task) => [task.taskId, task]),
    );
  };
  try {
    // The fixture has no registry dependencies and never invokes an installer.
    // Its tiny lock records workspace edges; the repository supplies Turbo itself.
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "raypx-cache-regression",
        private: true,
        packageManager: "bun@1.4.4",
        workspaces: ["packages/*"],
      }),
    );
    const workspaces: Record<string, unknown> = { "": { name: "raypx-cache-regression" } };
    for (const name of ["tokens", "consumer", "independent"]) {
      const directory = join(root, "packages", name);
      mkdirSync(join(directory, "src"), { recursive: true });
      const dependencies = name === "consumer" ? { "@raypx/tokens": "workspace:*" } : {};
      const manifest = {
        name: `@raypx/${name}`,
        private: true,
        type: "module",
        dependencies,
        scripts: { check: "bun --check --tsconfig-override tsconfig.json" },
      };
      workspaces[`packages/${name}`] = { name: manifest.name, dependencies };
      writeFileSync(join(directory, "package.json"), JSON.stringify(manifest));
      writeFileSync(
        join(directory, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            noEmit: true,
            target: "ESNext",
            module: "ESNext",
            moduleResolution: "Bundler",
            lib: ["ES2022"],
            types: [],
            paths: { "@raypx/tokens": ["../tokens/src/index.ts"] },
          },
          include: ["src"],
        }),
      );
      writeFileSync(
        join(directory, "src/index.ts"),
        name === "consumer"
          ? 'import { value } from "@raypx/tokens"; export const result = value + 1;\n'
          : "export const value: number = 1;\n",
      );
    }
    writeFileSync(
      join(root, "bun.lock"),
      JSON.stringify({ lockfileVersion: 2, configVersion: 1, workspaces, packages: {} }),
    );
    writeFileSync(
      join(root, "turbo.json"),
      JSON.stringify({
        tasks: {
          transit: { dependsOn: ["^transit"] },
          check: { dependsOn: ["transit"], outputs: [] },
        },
      }),
    );
    writeFileSync(join(root, ".gitignore"), "node_modules/\n.turbo/\n");
    run(["git", "init", "--quiet"]);
    run(["git", "add", "."]);
    run([
      "git",
      "-c",
      "user.name=Raypx test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "-c",
      `core.hooksPath=${join(root, ".git", "disabled-hooks")}`,
      "commit",
      "--quiet",
      "-m",
      "cache fixture",
    ]);
    const first = snapshot();
    const second = snapshot();
    expect(second.size).toBe(3);
    for (const [id, task] of second) {
      expect(task.cache.status).toBe("HIT");
      expect(task.hash).toBe(first.get(id)?.hash);
    }
    writeFileSync(join(root, "packages/tokens/src/index.ts"), "export const value: number = 2;\n");
    const changed = snapshot();
    for (const name of ["tokens", "consumer"]) {
      const id = `@raypx/${name}#check`;
      expect(changed.get(id)?.cache.status).toBe("MISS");
      expect(changed.get(id)?.hash).not.toBe(second.get(id)?.hash);
    }
    expect(changed.get("@raypx/independent#check")?.cache.status).toBe("HIT");
    expect(changed.get("@raypx/independent#check")?.hash).toBe(
      second.get("@raypx/independent#check")?.hash,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 30000);
