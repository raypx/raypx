import { spawnProcess, sleep } from "@raypx/runtime-node/process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { installWindowsSmoke } from "../../../scripts/host/windows-smoke-install.ts";
import { signingEnvironment } from "../../../scripts/host/signing.ts";

const cwd = resolve(import.meta.dirname, "../../..");
export function shouldInstallWindowsSmoke(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
) {
  return (
    platform === "win32" &&
    env.GITHUB_ACTIONS === "true" &&
    env.RUNNER_OS === "Windows" &&
    env.RUNNER_ENVIRONMENT === "github-hosted"
  );
}
export interface SmokeInstallation {
  binary: string;
  dispose(): Promise<void>;
}

export async function buildSmoke(): Promise<SmokeInstallation> {
  if (!["darwin", "win32"].includes(process.platform))
    throw new Error("Packaged native smoke is only verified on macOS and Windows");
  const env = {
    ...signingEnvironment(process.env, { smoke: true }),
    RAYPX_NATIVE_SMOKE_PACKAGE: "1",
    RAYPX_DESKTOP_NATIVE_SMOKE_BUILD: "1",
  };
  for (const command of [
    ["pnpm", "exec", "vp", "build", "--config", "vite.app.config.ts", "--mode", "native-smoke"],
    [
      process.execPath,
      "--import",
      import.meta.resolve("tsx"),
      "scripts/host/csp.ts",
      "artifacts/native-smoke/client",
    ],
    [process.execPath, "--import", import.meta.resolve("tsx"), "scripts/host/tauri.ts", "build"],
  ]) {
    const child = spawnProcess(command, {
      cwd,
      env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await child.exited) throw new Error("Tauri native-smoke packaging failed");
  }
  const output = resolve(cwd, "../../target/native-smoke/release");
  if (shouldInstallWindowsSmoke(process.platform, process.env))
    return installWindowsSmoke(output, resolve(cwd, "../cli/dist/raypx.exe"));
  return {
    binary:
      process.platform === "win32"
        ? join(output, "raypx-desktop.exe")
        : join(output, "bundle/macos/Raypx Test.app/Contents/MacOS/raypx-desktop"),
    dispose: async () => {},
  };
}

export async function runTauriSmoke(
  installation: SmokeInstallation,
  phase: string,
  directory: string,
  env: NodeJS.ProcessEnv,
) {
  const { binary } = installation;
  if (!existsSync(binary)) throw new Error("Build the Tauri native-smoke release first");
  const nonce = crypto.randomUUID();
  const endpoint =
    process.platform === "win32"
      ? String.raw`\\.\pipe\raypx-native-smoke-${nonce}`
      : join(tmpdir(), `raypx-${nonce}.sock`);
  const environment = {
    ...signingEnvironment(env, { smoke: true }),
    RAYPX_NATIVE_SMOKE_SOCKET: endpoint,
    RAYPX_NATIVE_SMOKE_TOKEN: crypto.randomUUID() + crypto.randomUUID(),
  };
  const native = spawnProcess([binary], {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const scenario = spawnProcess(
    [
      process.execPath,
      "--import",
      import.meta.resolve("tsx"),
      resolve(
        import.meta.dirname,
        phase === "agents" ? "agents.ts" : phase.startsWith("beta") ? "beta.ts" : "scenario.ts",
      ),
    ],
    { cwd, env: environment, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  const deadline = setTimeout(
    () => {
      native.kill();
      scenario.kill();
    },
    phase === "agents" ? 1_800_000 : phase.startsWith("beta") ? 720_000 : 120_000,
  );
  try {
    const first = await Promise.race([
      scenario.exited.then((code) => ({ source: "scenario", code })),
      native.exited.then((code) => ({ source: "native", code })),
    ]);
    if (first.source === "native" && first.code !== 0)
      throw new Error(`Native smoke ${phase} Desktop exited before assertions`);
    const scenarioCode = first.source === "scenario" ? first.code : await scenario.exited;
    if (scenarioCode !== 0) throw new Error(`Native smoke ${phase} assertions failed`);
    const code = await Promise.race([
      native.exited,
      sleep(5_000).then(() => {
        throw new Error("Desktop did not quit after smoke assertions");
      }),
    ]);
    if (code !== 0) throw new Error(`Native smoke ${phase} Desktop failed`);
  } finally {
    clearTimeout(deadline);
    native.kill();
    scenario.kill();
    await Promise.allSettled([native.exited, scenario.exited]);
    if (process.platform !== "win32") await rm(endpoint, { force: true });
    // The profile owner is cleaned up by the run.ts orchestrator after GUI Quit.
    void directory;
  }
}
