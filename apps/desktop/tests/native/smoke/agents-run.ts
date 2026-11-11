import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildSmoke, runMyGoSmoke } from "./launch.js";
import { prepareSmokeDirectory, removeSmokeDirectory } from "./session.js";
import { cleanupSmokeBundles } from "../../../scripts/host/smoke-artifacts.js";
import type { SmokeInstallation } from "./launch.js";
import { stopSmokeOwner } from "./owner.js";
import { nativeAgentProviders } from "../../../scripts/host/agent-options.js";

// Building or importing the scenario must never start paid inference implicitly.
if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to run real provider inference");
nativeAgentProviders(process.env);

const directory = await mkdtemp(join(tmpdir(), "raypx-live-agents-"));
const config = join(directory, "config");
let cleanupSucceeded = false;
let cleanupError: Error | undefined;
let installation: SmokeInstallation | undefined;
let results: unknown;

try {
  await prepareSmokeDirectory(directory);
  await mkdir(config, { recursive: true, mode: 0o700 });
  await writeFile(
    join(config, "config.toml"),
    '# Isolated local-only live Agent acceptance.\nbase_url = "http://127.0.0.1:1"\n',
    { mode: 0o600 },
  );
  installation = await buildSmoke();
  await runMyGoSmoke(installation, "agents", directory, {
    ...process.env,
    RAYPX_HOME: config,
    RAYPX_NATIVE_SMOKE: "1",
    RAYPX_NATIVE_SMOKE_PHASE: "agents",
    RAYPX_NATIVE_SMOKE_DATA_DIR: directory,
    RAYPX_NATIVE_SMOKE_UI: "quiet",
  });
  results = JSON.parse(await readFile(join(directory, "agents-result.json"), "utf8"));
} finally {
  try {
    cleanupSucceeded = await stopSmokeOwner(directory);
    if (!cleanupSucceeded) cleanupError = new Error("Live Agent smoke owner cleanup failed");
  } catch {
    cleanupError = new Error("Live Agent smoke owner cleanup failed");
  } finally {
    try {
      if (process.env.RAYPX_LIVE_KEEP === "1" || !cleanupSucceeded)
        console.info(`Live Agent acceptance data: ${directory}`);
      else await removeSmokeDirectory(directory);
    } finally {
      try {
        await installation?.dispose();
      } finally {
        await cleanupSmokeBundles(resolve(import.meta.dirname, "../../.."));
      }
    }
  }
}
if (cleanupError) throw cleanupError;
const evidence = resolve(import.meta.dirname, "../../../../../.artifacts/native-agents");
await mkdir(evidence, { recursive: true });
const report = join(evidence, `${Date.now()}.json`);
await writeFile(
  report,
  JSON.stringify(
    {
      status: "passed",
      completedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      acceptance: results,
    },
    null,
    2,
  ),
);
console.info(`Live Agent acceptance evidence: ${report}`);
