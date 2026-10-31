import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { preparePackager } from "./packager";
import { stageCli } from "./prepare-cli";
import { signingEnvironment } from "./signing";
import { generateNativeContracts } from "./generate";

const desktop = resolve(import.meta.dirname, "../..");
const root = resolve(desktop, "../..");
const [action, ...args] = Bun.argv.slice(2);
const manifest = JSON.parse(await readFile(join(desktop, "package.json"), "utf8"));
const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
const cli = join(root, "apps/cli/dist", executable);
const smoke = process.env.RAYPX_NATIVE_SMOKE_PACKAGE === "1";
const env = {
  ...signingEnvironment(process.env, { smoke }),
  CGO_ENABLED: "0",
  GOTOOLCHAIN: "go1.27.3",
  ...(smoke ? { GOFLAGS: `${process.env.GOFLAGS ?? ""} -tags=native_smoke` } : {}),
};
export function assertNativeTarget(
  supplied: readonly string[],
  options: { platform?: NodeJS.Platform; arch?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const goos = platform === "win32" ? "windows" : platform;
  const goarch = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : "";
  if (!["darwin", "linux", "windows"].includes(goos) || !goarch)
    throw new Error("This platform does not have a supported standalone CLI target");
  const target = `${goos}/${goarch}`;
  const inherited = options.env ?? process.env;
  if (
    (inherited.GOOS && inherited.GOOS !== goos) ||
    (inherited.GOARCH && inherited.GOARCH !== goarch)
  )
    throw new Error(`Go must target ${target} to match the bundled CLI`);
  for (let index = 0; index < supplied.length; index++) {
    const argument = supplied[index]!;
    let targets: string | undefined;
    if (argument === "-platform" || argument === "--platform") targets = supplied[++index];
    else if (/^--?platform=/.test(argument)) targets = argument.slice(argument.indexOf("=") + 1);
    else continue;
    if (!targets || targets.split(",").some((item) => item.trim() !== target))
      throw new Error(
        `Package only ${target}; cross-platform and universal packages need matching CLI artifacts`,
      );
  }
  return { goos, goarch };
}
async function checkCompilerTarget() {
  const target = assertNativeTarget(args);
  const probe = Bun.spawn(["go", "env", "-json", "GOOS", "GOARCH"], {
    cwd: desktop,
    env,
    stdout: "pipe",
    stderr: "inherit",
    timeout: 60_000,
  });
  const output = await new Response(probe.stdout).text();
  if (await probe.exited) throw new Error("Unable to identify the Go compiler target");
  const compiler: unknown = JSON.parse(output);
  if (
    !compiler ||
    typeof compiler !== "object" ||
    !("GOOS" in compiler) ||
    !("GOARCH" in compiler) ||
    compiler.GOOS !== target.goos ||
    compiler.GOARCH !== target.goarch
  )
    throw new Error("Go compiler target does not match this machine's standalone CLI");
}
async function run(command: string[], cwd = desktop) {
  const child = Bun.spawn(command, {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (await child.exited) throw new Error(`MyGo ${action} failed`);
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}
export async function prepare(
  rendererRequired = true,
  paths: { desktop: string; cli: string; renderer?: string; herdr?: string } = {
    desktop,
    cli,
    herdr: join(root, "apps/cli/dist/herdr"),
    renderer: smoke ? "artifacts/native-smoke/client" : "dist/client",
  },
) {
  if (!(await Bun.file(paths.cli).exists()))
    throw new Error("Build the matching standalone CLI first");
  const probe = Bun.spawn([paths.cli, "--version"], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 5000,
  });
  const version = (await new Response(probe.stdout).text()).trim();
  if ((await probe.exited) || version !== manifest.version) throw new Error("CLI version mismatch");
  if (paths.desktop === desktop && paths.herdr) {
    await run(
      [process.execPath, "run", "scripts/prepare-herdr.ts", paths.herdr],
      join(root, "apps/cli"),
    );
  }
  const generated = join(paths.desktop, "generated");
  await mkdir(generated, { recursive: true });
  await generateNativeContracts(paths.desktop);
  await writeFile(join(generated, "version.json"), JSON.stringify(manifest.version) + "\n");
  const frontend = join(generated, "frontend");
  await rm(frontend, { recursive: true, force: true });
  if (
    rendererRequired ||
    (await Bun.file(join(paths.desktop, paths.renderer ?? "dist/client", "index.html")).exists())
  )
    await cp(join(paths.desktop, paths.renderer ?? "dist/client"), frontend, { recursive: true });
  else {
    // Go embeds this directory even while the renderer is served by Vite.
    await mkdir(frontend, { recursive: true });
    await writeFile(join(frontend, ".keep"), "");
  }
  await mkdir(join(paths.desktop, "resources/bin"), { recursive: true });
  await stageCli(paths.cli, join(paths.desktop, "resources/bin", executable));
  if (paths.herdr) {
    const target = join(paths.desktop, "resources/bin/herdr");
    await rm(target, { recursive: true, force: true });
    await cp(paths.herdr, target, { recursive: true });
  }
}
if (import.meta.main) {
  await checkCompilerTarget();
  switch (action) {
    case "prepare":
      await prepare();
      break;
    case "build":
      await prepare();
      await run(
        ["go", "run", "-mod=readonly", ".", "build", ...args, desktop],
        await preparePackager(env),
      );
      break;
    case "check":
      await run(["go", "vet", "./internal/...", "./tests/native/host/...", ...args]);
      break;
    case "test":
      await run(["go", "test", "./internal/...", "./tests/native/host/...", ...args]);
      break;
    case "smoke": {
      await prepare();
      const binary = join(
        desktop,
        "build/check",
        process.platform === "win32" ? "Raypx.exe" : "Raypx",
      );
      await mkdir(join(desktop, "build/check"), { recursive: true });
      await run([
        "go",
        "build",
        "-trimpath",
        "-tags",
        "mygo_noinspector",
        "-ldflags",
        "-s -w -X github.com/egoist/mygo.production=1",
        "-o",
        binary,
        ".",
      ]);
      await run([binary, "--self-check", "--cli", cli]);
      console.log(
        "MyGo headless artifact check passed; native GUI behavior is a separate acceptance gate.",
      );
      break;
    }
    case "dev":
      await prepare(false);
      await run(["go", "run", "github.com/egoist/mygo/cmd/mygo@v0.7.3", "dev", ...args]);
      break;
    case undefined:
    default:
      throw new Error("Usage: mygo.ts prepare|build|check|test|smoke|dev");
  }
}
