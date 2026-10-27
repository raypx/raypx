import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { buildSmoke, runTauriSmoke } from "./launch";
import { prepareSmokeDirectory } from "./session";
import { cleanupSmokeBundles } from "../../../scripts/native/smoke-artifacts";
import type { SmokeInstallation } from "../../../scripts/native/windows-smoke-install";

// Building or importing the scenario must never start paid inference implicitly.
if (process.env.RAYPX_LIVE_AGENTS !== "1")
  throw new Error("Set RAYPX_LIVE_AGENTS=1 to run real Claude and Codex inference");

const directory = await mkdtemp(join(tmpdir(), "raypx-live-agents-"));
const config = join(directory, "config");
const binary = resolve(
  import.meta.dirname,
  "../../../../cli/dist",
  process.platform === "win32" ? "raypx.exe" : "raypx",
);
let cleanupSucceeded = process.platform !== "darwin";
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
  await runTauriSmoke(installation, "agents", directory, {
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
    if (process.platform === "darwin") {
      // macOS GUI Quit preserves its owner; this isolated profile must be stopped explicitly.
      const stop = Bun.spawn(
        [binary, "daemon", "stop", "--profile", "native-smoke", "--data-dir", directory],
        { stdin: "ignore", stdout: "ignore", stderr: "ignore" },
      );
      const deadline = setTimeout(() => stop.kill(), 30_000);
      try {
        cleanupSucceeded = (await stop.exited) === 0;
        if (!cleanupSucceeded) cleanupError = new Error("Live Agent smoke owner cleanup failed");
      } finally {
        clearTimeout(deadline);
      }
    }
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
      else await rm(directory, { recursive: true, force: true });
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
