import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sealCliPayload, verifyCliPayload } from "@raypx/tooling/build/cli";
import manifest from "../package.json";
import repository from "../../../package.json";

if (`bun@${Bun.version}` !== repository.packageManager)
  throw new Error(`Compile CLI with ${repository.packageManager}`);
// Artifact consumers reach this task as a graph prerequisite and never compile.
if (process.env.RAYPX_CLI_PAYLOAD) {
  console.log("Using the prepared CLI payload; compilation skipped");
  process.exit(0);
}
const root = resolve(import.meta.dirname, "../../..");
const output = resolve(import.meta.dirname, "../dist");
const git = Bun.spawn(["git", "rev-parse", "HEAD"], {
  cwd: root,
  stdout: "pipe",
  stderr: "inherit",
});
const commit = (await new Response(git.stdout).text()).trim();
if (await git.exited) throw new Error("Cannot identify delivery commit");
const builtAt = Date.now();
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const result = await Bun.build({
  entrypoints: [resolve(import.meta.dirname, "../src/main.ts")],
  compile: { outfile: join(output, process.platform === "win32" ? "raypx.exe" : "raypx") },
  target: "bun",
  format: "esm",
  minify: true,
  bytecode: true,
  // Cache startup bytecode without serializing every lazily loaded function.
  bytecodeDepth: 0,
  define: { __RAYPX_CLI_BUILT_AT__: String(builtAt) },
});
if (!result.success) throw new AggregateError(result.logs, "CLI compilation failed");
await cp(join(root, "LICENSE"), join(output, "LICENSE"));
await writeFile(
  join(output, "README.txt"),
  "Raypx CLI\nRun ./raypx (Windows: .\\raypx.exe). The executable embeds Bun.\nPair with raypx device pair and confirm each Space directory grant on this machine.\nDesktop uses the same bundled CLI for private session transport.\nKeep runtime.json, LICENSE and README.txt beside the executable.\nStop this installation's connector and Desktop session daemon before replacing it.\n",
);
await sealCliPayload(output, {
  format: 2,
  commit,
  platform: process.platform,
  arch: process.arch,
  version: manifest.version,
  builtAt,
  bunVersion: Bun.version,
});
await verifyCliPayload(output, { commit, builtAt });
