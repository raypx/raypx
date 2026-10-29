import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { buildSmoke, runMyGoSmoke } from "./launch";
import { prepareSmokeDirectory, removeSmokeDirectory } from "./session";
import { cleanupSmokeBundles } from "../../../scripts/native/smoke-artifacts";
import type { SmokeInstallation } from "./launch";
import { stopSmokeOwner } from "./owner";

// Building or importing the scenario must never start paid inference implicitly.
if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to run real Claude and Codex inference");

const directory = await mkdtemp(join(tmpdir(), "raypx-live-agents-"));
const config = join(directory, "config");
let cleanupSucceeded = false;
let cleanupError: Error | undefined;
let installation: SmokeInstallation | undefined;

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
    RAYPX_NATIVE_SMOKE_CLEANUP_SESSIONS: "true",
  });
} finally {
  try {
    cleanupSucceeded = await stopSmokeOwner(directory);
    if (!cleanupSucceeded) cleanupError = new Error("Live Agent smoke owner cleanup failed");
  } catch {
    cleanupError = new Error("Live Agent smoke owner cleanup failed");
  } finally {
    const sessionsCleaned =
      !existsSync(join(directory, "servers")) ||
      existsSync(join(directory, ".native-smoke-sessions-cleaned"));
    if (!sessionsCleaned) {
      cleanupError ??= new Error("Live Agent smoke session cleanup failed");
      process.exitCode = 1;
    }
    try {
      if (process.env.RAYPX_LIVE_KEEP === "1" || !cleanupSucceeded || !sessionsCleaned)
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
