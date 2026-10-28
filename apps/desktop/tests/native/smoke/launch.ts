import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { tauriArguments, tauriSigningEnvironment } from "../../../scripts/native/tauri";
import {
  installWindowsSmoke,
  type SmokeInstallation,
} from "../../../scripts/native/windows-smoke-install";

const cwd = resolve(import.meta.dirname, "../../..");
const target = resolve(cwd, "../../target/native-smoke");

export function shouldInstallWindowsSmoke(
  platform: NodeJS.Platform,
  environment: Readonly<Record<string, string | undefined>>,
) {
  return (
    platform === "win32" &&
    environment.GITHUB_ACTIONS === "true" &&
    environment.RUNNER_OS === "Windows" &&
    environment.RUNNER_ENVIRONMENT === "github-hosted"
  );
}

export async function buildSmoke(): Promise<SmokeInstallation> {
  if (!["darwin", "win32"].includes(process.platform))
    throw new Error("Packaged native smoke is only verified on macOS and Windows");
  const child = Bun.spawn(
    [
      process.execPath,
      "--bun",
      "tauri",
      ...tauriArguments([
        "build",
        "--no-sign",
        "--features",
        "native-smoke",
        "--config",
        "src-tauri/tauri.smoke.conf.json",
        "--bundles",
        process.platform === "darwin" ? "app" : "nsis",
      ]),
    ],
    {
      cwd,
      env: { ...tauriSigningEnvironment(process.env, { smoke: true }), CARGO_TARGET_DIR: target },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if ((await child.exited) !== 0) throw new Error("Tauri native-smoke packaging failed");
  if (process.platform === "win32") {
    if (shouldInstallWindowsSmoke(process.platform, process.env))
      return installWindowsSmoke(target, resolve(cwd, "../cli/dist/raypx.exe"));
    console.info(
      "Windows smoke runs the Cargo build directly; NSIS installation is not validated outside a GitHub-hosted Windows runner.",
    );
    return {
      binary: join(target, "release/raypx-desktop.exe"),
      dispose: async () => {},
    };
  }
  return {
    binary: join(target, "release/bundle/macos/Raypx Test.app/Contents/MacOS/raypx-desktop"),
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
    ...tauriSigningEnvironment(env, { smoke: true }),
    RAYPX_NATIVE_SMOKE_SOCKET: endpoint,
    RAYPX_NATIVE_SMOKE_TOKEN: crypto.randomUUID() + crypto.randomUUID(),
  };
  const native = Bun.spawn([binary], {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const scenario = Bun.spawn(
    [
      process.execPath,
      "run",
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
      Bun.sleep(5_000).then(() => {
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
