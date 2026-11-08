import { serveHttp } from "@raypx/runtime-node/http";
import { readJsonFile } from "@raypx/runtime-node/files";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cleanupSmokeBundles } from "../../../scripts/host/smoke-artifacts.ts";
import { nativeSmokeOptions } from "../../../scripts/host/smoke-options.ts";
import { buildSmoke, runTauriSmoke } from "./launch.ts";
import type { SmokeInstallation } from "./launch.ts";
import { prepareSmokeDirectory, removeSmokeDirectory } from "./session.ts";
import {
  assertSmokeOwnerRunning,
  stopSmokeOwner,
  startSmokeOwner,
  smokeOwnerIdentity,
} from "./owner.ts";

const { phase, ui } = nativeSmokeOptions(process.argv.slice(2), process.env);
const phases: { phase: string; daemon: Awaited<ReturnType<typeof smokeOwnerIdentity>> }[] = [];
let payloadCommit: string | undefined;

async function run(smokePhase: string, directory: string, restoredServer = false) {
  if (!installation) throw new Error("Native smoke installation is unavailable");
  const runtime = await readJsonFile(
    resolve(import.meta.dirname, "../../../resources/bin/runtime.json"),
  );
  payloadCommit = runtime.commit;
  await runTauriSmoke(installation, smokePhase, directory, {
    ...process.env,
    RAYPX_HOME: join(directory, "config"),
    CLAUDE_CONFIG_DIR: join(directory, "claude"),
    CODEX_HOME: join(directory, "codex"),
    RAYPX_NATIVE_SMOKE: "1",
    RAYPX_NATIVE_SMOKE_UI: ui,
    RAYPX_NATIVE_SMOKE_PHASE: smokePhase,
    RAYPX_NATIVE_SMOKE_DATA_DIR: directory,
    RAYPX_NATIVE_SMOKE_RESTORED_SERVER: String(restoredServer),
    RAYPX_NATIVE_SMOKE_BUN: runtime.bunVersion,
  });
  const beforeQuit = JSON.parse(await readFile(join(directory, "daemon-before-quit.json"), "utf8"));
  const afterQuit = await smokeOwnerIdentity(directory);
  assert.deepEqual(afterQuit, beforeQuit, "GUI Quit changed the independent daemon PID/epoch");
  phases.push({ phase: smokePhase, daemon: afterQuit });
}
const directory = await mkdtemp(join(tmpdir(), "raypx-native-smoke-"));
const loopbackOrigin = async () => {
  const server = await serveHttp({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const origin = `http://127.0.0.1:${server.port}`;
  await server.stop(true);
  return origin;
};
async function configure(origin: string) {
  await mkdir(join(directory, "config"), { recursive: true });
  await writeFile(
    join(directory, "config/config.toml"),
    `# Same packaged renderer; choose its server at runtime.\nprofile = "acceptance"\n[profiles.acceptance]\nbase_url = ${JSON.stringify(origin)}\n`,
    { mode: 0o600 },
  );
}
let directoryPrepared = false;
let installation: SmokeInstallation | undefined;
let verified = false;
let cleaned = false;
try {
  await prepareSmokeDirectory(directory);
  directoryPrepared = true;
  installation = await buildSmoke();
  const api =
    phase === "shell" || phase === "restore"
      ? await loopbackOrigin()
      : process.env.RAYPX_NATIVE_SMOKE_API;
  if (!api) throw new Error("HTTPS native acceptance requires RAYPX_NATIVE_SMOKE_API");
  await configure(api);
  await run(phase, directory);
  if (phase === "shell") {
    await assertSmokeOwnerRunning(directory);
    console.info("Native smoke daemon preserved after actual GUI Quit");
  }
  if (phase === "shell") {
    let other = await loopbackOrigin();
    while (other === api) other = await loopbackOrigin();
    await configure(other);
    await run("restore", directory);
    await configure(api);
    assert.ok(await stopSmokeOwner(directory), "Could not stop the Desktop-first daemon");
    const cliFirst = await startSmokeOwner(directory);
    await run("restore", directory, true);
    assert.deepEqual(
      await smokeOwnerIdentity(directory),
      cliFirst,
      "Desktop replaced the CLI-first daemon",
    );
  }
  if (phase === "write") await run("read", directory);
  verified = true;
} finally {
  try {
    if (directoryPrepared) {
      let ownerStopped = false;
      try {
        // GUI Quit preserves its independent owner on both macOS and Windows.
        ownerStopped = await stopSmokeOwner(directory);
        if (ownerStopped) await removeSmokeDirectory(directory);
        else {
          console.error(`Native smoke teardown incomplete; retained ${directory}`);
          process.exitCode = 1;
        }
      } finally {
        try {
          await installation?.dispose();
        } finally {
          await cleanupSmokeBundles(resolve(import.meta.dirname, "../../.."));
        }
      }
      cleaned = ownerStopped;
    }
  } finally {
    const evidence = resolve(import.meta.dirname, "../../../../../.artifacts/native-smoke");
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, `${Date.now()}.json`),
      JSON.stringify(
        {
          status: verified && cleaned ? "passed" : "failed",
          framework: "tauri",
          commit: payloadCommit ?? process.env.GITHUB_SHA ?? null,
          platform: process.platform,
          arch: process.arch,
          phase,
          ui,
          phases,
        },
        null,
        2,
      ),
    );
  }
}
