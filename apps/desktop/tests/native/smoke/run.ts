import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cleanupSmokeBundles } from "../../../scripts/host/smoke-artifacts.js";
import { nativeSmokeOptions } from "../../../scripts/host/smoke-options.js";
import { buildSmoke, runMyGoSmoke } from "./launch.js";
import type { SmokeInstallation } from "./launch.js";
import { prepareSmokeDirectory, removeSmokeDirectory } from "./session.js";
import {
  assertSmokeOwnerRunning,
  stopSmokeOwner,
  startSmokeOwner,
  smokeOwnerIdentity,
} from "./owner.js";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../../../package.json"),
).json();
const { phase, ui } = nativeSmokeOptions(process.argv.slice(2), process.env);

async function run(smokePhase: string, directory: string, restoredServer = false) {
  if (!installation) throw new Error("Native smoke installation is unavailable");
  await runMyGoSmoke(installation, smokePhase, directory, {
    ...process.env,
    RAYPX_HOME: join(directory, "config"),
    CLAUDE_CONFIG_DIR: join(directory, "claude"),
    CODEX_HOME: join(directory, "codex"),
    RAYPX_NATIVE_SMOKE: "1",
    RAYPX_NATIVE_SMOKE_UI: ui,
    RAYPX_NATIVE_SMOKE_PHASE: smokePhase,
    RAYPX_NATIVE_SMOKE_DATA_DIR: directory,
    RAYPX_NATIVE_SMOKE_RESTORED_SERVER: String(restoredServer),
    RAYPX_NATIVE_SMOKE_BUN: packageManager,
  });
  const beforeQuit = JSON.parse(await readFile(join(directory, "daemon-before-quit.json"), "utf8"));
  assert.deepEqual(
    await smokeOwnerIdentity(directory),
    beforeQuit,
    "GUI Quit changed the independent daemon PID/epoch",
  );
}
const directory = await mkdtemp(join(tmpdir(), "raypx-native-smoke-"));
const loopbackOrigin = async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
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
} finally {
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
  }
}
