import { sleep } from "@raypx/runtime-node/process";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { installWindowsSmoke } from "../../../scripts/host/windows-smoke-install.js";
import { signingEnvironment } from "../../../scripts/host/signing.js";

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

export async function assertSmokeBinary(binary: string, env: NodeJS.ProcessEnv) {
  const probe = Bun.spawn(["go", "version", "-m", binary], {
    env,
    stdout: "pipe",
    stderr: "ignore",
  });
  const metadata = await new Response(probe.stdout).text();
  if ((await probe.exited) || !/(?:^|[\s,=])native_smoke(?:[\s,]|$)/m.test(metadata))
    throw new Error("Native smoke artifact validation: executable lacks native_smoke build tag");
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
    [
      process.execPath,
      "--bun",
      "vp",
      "build",
      "--config",
      "vite.app.config.ts",
      "--mode",
      "native-smoke",
    ],
    [process.execPath, "scripts/host/csp.ts", "artifacts/native-smoke/client"],
    [process.execPath, "scripts/host/mygo.ts", "build", "-skip-dmg"],
  ]) {
    const child = Bun.spawn(command, {
      cwd,
      env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await child.exited) throw new Error("MyGo native-smoke packaging failed");
  }
  const platform = process.platform === "win32" ? "windows" : "darwin";
  const arch = process.arch === "x64" ? "amd64" : process.arch;
  const output = join(cwd, "build/native-smoke", `${platform}-${arch}`);
  if (shouldInstallWindowsSmoke(process.platform, process.env))
    return installWindowsSmoke(output, resolve(cwd, "../cli/dist/raypx.exe"));
  return {
    binary:
      process.platform === "win32"
        ? join(output, "Raypx Test.exe")
        : join(output, "Raypx Test.app/Contents/MacOS/Raypx Test"),
    dispose: async () => {},
  };
}

export async function runMyGoSmoke(
  installation: SmokeInstallation,
  phase: string,
  directory: string,
  env: NodeJS.ProcessEnv,
) {
  const { binary } = installation;
  await assertSmokeBinary(binary, env);
  if (!existsSync(binary)) throw new Error("Build the MyGo native-smoke release first");
  const nonce = crypto.randomUUID();
  const endpoint =
    process.platform === "win32"
      ? String.raw`\\.\pipe\raypx-native-smoke-${nonce}`
      : join(tmpdir(), `raypx-${nonce}.sock`);
  const environment = {
    ...signingEnvironment(env, { smoke: true }),
    RAYPX_NATIVE_SMOKE_SOCKET: endpoint,
    RAYPX_NATIVE_SMOKE_TOKEN: crypto.randomUUID() + crypto.randomUUID(),
    RAYPX_NATIVE_SMOKE_COMPLETE_FILE: join(directory, `native-smoke-complete-${phase}-${nonce}`),
  };
  const native = Bun.spawn([binary], {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });
  const scenario = Bun.spawn(
    [process.execPath, "run", resolve(import.meta.dirname, "scenario.ts")],
    { cwd, env: environment, stdin: "ignore", stdout: "inherit", stderr: "inherit" },
  );
  const deadline = setTimeout(() => {
    native.kill();
    scenario.kill();
  }, 300_000);
  try {
    const first = await Promise.race([
      scenario.exited.then((code) => ({ source: "scenario", code })),
      native.exited.then((code) => ({ source: "native", code })),
    ]);
    let scenarioCode: number;
    if (first.source === "native") {
      const [entry, diagnostic, lifecycle, complete] = await Promise.all([
        readFile(join(directory, "native-smoke-entry"), "utf8").catch(() => undefined),
        readFile(join(directory, "native-smoke-startup-error"), "utf8").catch(() => undefined),
        readFile(join(directory, "native-smoke-lifecycle"), "utf8").catch(() => undefined),
        readFile(environment.RAYPX_NATIVE_SMOKE_COMPLETE_FILE, "utf8").catch(() => undefined),
      ]);
      if (first.code === 0 && complete === "raypx-native-smoke-complete/1\n") {
        scenarioCode = await Promise.race([
          scenario.exited,
          sleep(5_000).then(() => {
            throw new Error("Smoke scenario did not finish after requesting Desktop Quit");
          }),
        ]);
      } else {
        let timeout: NodeJS.Timeout | undefined;
        const scenarioExit = await Promise.race([
          scenario.exited.then((code) => ({ code })),
          new Promise<undefined>((resolveTimeout) => {
            timeout = setTimeout(() => resolveTimeout(undefined), 30_000);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        const details = [
          entry ? `entry: ${entry}` : "entry: missing",
          diagnostic,
          lifecycle?.trim(),
        ]
          .filter(Boolean)
          .join("\n");
        throw new Error(
          `Native smoke ${phase} Desktop exited before assertions (${first.code}); scenario ${scenarioExit ? `exited (${scenarioExit.code})` : "did not exit within 30 seconds"}${details ? `:\n${details}` : ""}`,
        );
      }
    } else {
      scenarioCode = first.code;
    }
    if (scenarioCode !== 0) {
      const desktop =
        native.exitCode === null
          ? "still running"
          : `exited (${native.signalCode ?? native.exitCode})`;
      throw new Error(`Native smoke ${phase} assertions failed; Desktop process ${desktop}`);
    }
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
