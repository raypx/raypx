import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sealCliPayload, verifyCliPayload } from "@raypx/tooling/build/cli";
import { prepareHerdr } from "../src/runtime/process/herdr-release.js";
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
const herdr = join(
  root,
  ".cache/herdr",
  manifest.herdr.version,
  `${process.platform}-${process.arch}`,
);
await prepareHerdr(herdr);
await cp(herdr, join(output, "herdr"), { recursive: true });
await cp(join(root, "LICENSE"), join(output, "LICENSE"));
await writeFile(
  join(output, "README.txt"),
  "Raypx CLI\nRun ./raypx (Windows: .\\raypx.exe). Add this whole directory to PATH.\nKeep herdr/ and runtime.json beside the executable. Node and Bun are not required.\nProject package managers and external provider CLIs come from your environment.\nRun raypx --help and raypx login to enroll this device for one account and server origin.\nThe signed local identity permits offline work; logout preserves local profiles and history.\nTo replace the installation, quit Desktop, run raypx daemon stop and wait for running processes to exit.\nExtract the complete new directory; retain your local profile and configuration.\n",
);
await sealCliPayload(output, {
  format: 1,
  commit,
  platform: process.platform,
  arch: process.arch,
  version: manifest.version,
  builtAt,
  bunVersion: Bun.version,
  herdrVersion: manifest.herdr.version,
});
await verifyCliPayload(output, { commit, builtAt });
