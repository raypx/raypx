import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { cleanupSmokeBundles } from "../../../scripts/native/smoke-artifacts";
import { nativeSmokeOptions } from "../../../scripts/native/smoke-options";
import { buildSmoke, runTauriSmoke } from "./launch";
import type { SmokeInstallation } from "../../../scripts/native/windows-smoke-install";
import { prepareSmokeDirectory } from "./session";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../../../package.json"),
).json();
const { phase, ui } = nativeSmokeOptions(process.argv.slice(2), process.env);

async function run(smokePhase: string, directory: string, restoredServer = false) {
  const final =
    !["shell", "write", "beta"].includes(smokePhase) &&
    (smokePhase !== "restore" || phase !== "shell" || restoredServer);
  if (!installation) throw new Error("Native smoke installation is unavailable");
  return runTauriSmoke(installation, smokePhase, directory, {
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
    RAYPX_NATIVE_SMOKE_CLEANUP_SESSIONS: String(final),
  });
}
if (
  phase.startsWith("beta") &&
  (!process.env.RAYPX_NATIVE_SMOKE_DATA_DIR || process.env.RAYPX_LIVE_AGENTS !== "1")
)
  throw new Error(
    "Beta smoke requires RAYPX_LIVE_AGENTS=1 and an isolated RAYPX_NATIVE_SMOKE_DATA_DIR",
  );
const directory = phase.startsWith("beta")
  ? resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR!)
  : await mkdtemp(join(tmpdir(), "raypx-native-smoke-"));
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
  if (process.platform === "darwin" && phase === "shell") {
    const status = Bun.spawn(
      [
        resolve(import.meta.dirname, "../../../../cli/dist/raypx"),
        "daemon",
        "status",
        "--profile",
        "native-smoke",
        "--data-dir",
        directory,
        "--json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const result = JSON.parse(await new Response(status.stdout).text());
    assert.equal(await status.exited, 0);
    assert.equal(result.running, true, "GUI Quit terminated its independent execution owner");
    console.info("Native smoke daemon preserved after actual GUI Quit");
  }
  if (phase === "shell") {
    let other = await loopbackOrigin();
    while (other === api) other = await loopbackOrigin();
    await configure(other);
    await run("restore", directory);
    await configure(api);
    await run("restore", directory, true);
  }
  if (phase === "write") await run("read", directory);
  if (phase === "beta") await run("beta-restore", directory);
} finally {
  if (directoryPrepared) {
    let ownerStopped = process.platform !== "darwin";
    try {
      if (process.platform === "darwin") {
        // GUI Quit deliberately preserves its independent owner, including smoke profiles.
        const stop = Bun.spawn(
          [
            resolve(import.meta.dirname, "../../../../cli/dist/raypx"),
            "daemon",
            "stop",
            "--profile",
            "native-smoke",
            "--data-dir",
            directory,
          ],
          {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          },
        );
        const deadline = setTimeout(() => stop.kill(), 30_000);
        try {
          ownerStopped = (await stop.exited) === 0;
        } finally {
          clearTimeout(deadline);
        }
      }
      if (!phase.startsWith("beta")) {
        if (
          ownerStopped &&
          (!existsSync(join(directory, "servers")) ||
            existsSync(join(directory, ".native-smoke-sessions-cleaned")))
        )
          await rm(directory, { recursive: true, force: true });
        else {
          console.error(`Native smoke teardown incomplete; retained ${directory}`);
          process.exitCode = 1;
        }
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
