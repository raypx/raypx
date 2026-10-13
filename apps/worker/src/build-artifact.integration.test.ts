import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const viteUrl = pathToFileURL(require.resolve("vite-plus")).href;
const nitroUrl = pathToFileURL(require.resolve("nitro/vite")).href;
const configUrl = new URL("../nitro.config.ts", import.meta.url).href;

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-worker-nitro-"));
  const workspace = join(directory, "workspace");
  const output = join(directory, "artifact");
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "fixture", private: true, type: "module" }),
    "src/main.ts": `import { value } from "./shared.js";
import { render } from "react-email";
import { fork } from "node:child_process";
if (process.argv.includes("--runner")) {
  if (process.argv.includes("--check")) console.log(value);
  else {
    const { startRunner } = await import("./runner-main.js");
    startRunner();
  }
} else {
  const result = await new Promise((resolve, reject) => {
    const child = fork(process.argv[1], ["--runner"], {
      execPath: process.execPath, execArgv: ["--no-env-file", "--no-install"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    let result;
    child.once("error", reject);
    child.on("message", (message) => {
      if (message.type === "ready") child.send({ type: "start" });
      else if (message.type === "done") result = message.value;
    });
    child.once("close", (code, signal) => {
      if (code === 0 && signal === null && result) resolve(result);
      else reject(new Error("Runner IPC failed: " + code + ":" + signal));
    });
  });
  console.log(value + ":" + render() + ":" + result);
}
`,
    "src/shared.ts": `import { value } from "asset-package";
export { value };
`,
    "src/runner-main.ts": `import { value } from "./shared.js";
export function startRunner() {
  process.once("message", (message) => {
    if (message.type !== "start") return;
    process.send({ type: "done", value });
    process.disconnect();
  });
  process.send({ type: "ready" });
}
`,
    "node_modules/asset-package/package.json": JSON.stringify({
      name: "asset-package",
      version: "1.0.0",
      type: "module",
      exports: { ".": "./index.mjs", "./self": "./self.mjs" },
      dependencies: { "required-package": "1.0.0" },
      peerDependencies: { tooling: "*" },
      peerDependenciesMeta: { tooling: { optional: true } },
    }),
    "node_modules/asset-package/index.mjs": `import { readFileSync } from "node:fs";
import { text } from "required-package";
import { suffix } from "asset-package/self";
const asset = JSON.parse(readFileSync(new URL("./asset.json", import.meta.url), "utf8"));
export const value = asset.label + ":" + text + ":" + suffix;
`,
    "node_modules/asset-package/self.mjs": 'export const suffix = "self";\n',
    "node_modules/asset-package/asset.json": JSON.stringify({ label: "asset" }),
    // Computed template paths require full-package tracing.
    "node_modules/asset-package/templates/report.txt": "runtime template\n",
    "node_modules/required-package/package.json": JSON.stringify({
      name: "required-package",
      version: "1.0.0",
      type: "module",
      exports: "./index.mjs",
    }),
    "node_modules/required-package/index.mjs": 'export const text = "required";\n',
    "node_modules/tooling/package.json": JSON.stringify({
      name: "tooling",
      version: "1.0.0",
      type: "module",
      exports: "./index.mjs",
    }),
    "node_modules/tooling/index.mjs": 'throw new Error("Tooling entered the artifact");\n',
    "node_modules/react-email/package.json": JSON.stringify({
      name: "react-email",
      version: "1.0.0",
      type: "module",
      exports: "./index.mjs",
      sideEffects: false,
      dependencies: { tooling: "1.0.0" },
    }),
    "node_modules/react-email/index.mjs": 'export function render() { return "mail"; }\n',
  };
  for (const [path, content] of Object.entries(files)) {
    const target = join(workspace, path);
    await mkdir(join(target, ".."), { recursive: true });
    await writeFile(target, content);
  }
  await symlink(
    dirname(require.resolve("vite/package.json")),
    join(workspace, "node_modules/vite"),
    "dir",
  );
  return { directory, workspace, output };
}

async function buildArtifact(workspace: string, output: string) {
  await execute(
    process.execPath,
    [
      "--no-env-file",
      "--no-install",
      "--eval",
      `
const { createBuilder } = await import(${JSON.stringify(viteUrl)});
const { nitro } = await import(${JSON.stringify(nitroUrl)});
const { default: configuration } = await import(${JSON.stringify(configUrl)});
const { basename } = await import("node:path");
const workspace = ${JSON.stringify(workspace)};
const output = ${JSON.stringify(output)};
const builder = await createBuilder({
  root: workspace, configFile: false,
  plugins: nitro({
    ...configuration, configFile: false, entry: workspace + "/src/main.ts",
    output: { dir: output, serverDir: output + "/server", publicDir: output + "/public" },
    traceDeps: ["asset-package*"],
    rolldownConfig: {
      ...configuration.rolldownConfig,
      input: Object.fromEntries(Object.entries(configuration.rolldownConfig.input).map(([name, entry]) => [name, workspace + "/src/" + basename(entry)])),
    },
  }),
});
await builder.buildApp();
`,
    ],
    { cwd: workspace, timeout: 30_000 },
  );
}

describe("Worker Nitro artifact", () => {
  it("runs Host and IPC Runner modes from one relocated entry without source or development tooling", async () => {
    const { directory, workspace, output } = await fixture();
    const deployment = await mkdtemp(join(tmpdir(), "raypx-worker-deployment-"));
    try {
      await buildArtifact(workspace, output);
      const server = join(output, "server");
      expect(existsSync(join(server, "index.mjs"))).toBe(true);
      expect(existsSync(join(server, "runner.mjs"))).toBe(false);
      expect(
        (await readdir(server)).some((name) => name.endsWith(".mjs") && name !== "index.mjs"),
      ).toBe(true);
      expect((await readdir(server)).some((name) => name.endsWith(".mjs.map"))).toBe(true);
      expect(existsSync(join(server, "node_modules/tooling"))).toBe(false);
      expect(existsSync(join(server, "node_modules/react-email"))).toBe(false);
      expect(
        await readFile(join(server, "node_modules/asset-package/templates/report.txt"), "utf8"),
      ).toBe("runtime template\n");
      await rename(output, join(deployment, "artifact"));
      await rm(directory, { recursive: true, force: true });
      const relocated = join(deployment, "artifact/server");
      const main = await execute(
        process.execPath,
        ["--no-env-file", "--no-install", join(relocated, "index.mjs")],
        { cwd: deployment },
      );
      const runner = await execute(
        process.execPath,
        ["--no-env-file", "--no-install", join(relocated, "index.mjs"), "--runner", "--check"],
        { cwd: deployment },
      );
      expect(main.stdout.trim()).toBe("asset:required:self:mail:asset:required:self");
      expect(runner.stdout.trim()).toBe("asset:required:self");
      const info = JSON.parse(await readFile(join(deployment, "artifact/nitro.json"), "utf8"));
      expect(info.preset).toBe("bun");
    } finally {
      await Promise.all([
        rm(directory, { recursive: true, force: true }),
        rm(deployment, { recursive: true, force: true }),
      ]);
    }
  }, 30_000);

  it("replaces stale runtime assets and restores a complete cached artifact", async () => {
    const { directory, workspace, output } = await fixture();
    try {
      await buildArtifact(workspace, output);
      await writeFile(
        join(workspace, "node_modules/asset-package/asset.json"),
        '{"label":"updated"}\n',
      );
      await rm(join(workspace, "node_modules/asset-package/templates/report.txt"));
      await buildArtifact(workspace, output);
      expect(
        existsSync(join(output, "server/node_modules/asset-package/templates/report.txt")),
      ).toBe(false);
      const cached = join(directory, "cached");
      await cp(output, cached, { recursive: true });
      await rm(output, { recursive: true });
      await rm(workspace, { recursive: true });
      await cp(cached, output, { recursive: true });
      const result = await execute(
        process.execPath,
        ["--no-env-file", "--no-install", join(output, "server/index.mjs")],
        { cwd: directory },
      );
      expect(result.stdout.trim()).toBe("updated:required:self:mail:updated:required:self");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
