import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { sealCliPayload, verifyCliPayload } from "../build/cli.js";
import { taskModel } from "../tasks/model.js";
import { readBunPin } from "./toolchain.js";

const root = resolve(import.meta.dirname, "../../../..");
if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error("The split-runtime comparison requires native Windows x64");
if (Bun.version !== readBunPin(root)) throw new Error("Use the pinned Bun for this experiment");
if (process.argv.length !== 3) throw new Error("Usage: bun bun-split.ts <prepared CLI directory>");
const prepared = resolve(process.argv[2]!);
const identity = await verifyCliPayload(prepared, {
  platform: process.platform,
  arch: process.arch,
  bunVersion: Bun.version,
});
const cli = taskModel(root).members.find((member) => member.name === "cli");
if (!cli) throw new Error("CLI workspace is unavailable");
const parent = join(root, ".artifacts/bun-split");
await mkdir(parent, { recursive: true });
const evidence = await mkdtemp(join(parent, "win32-x64-"));
const temporary = join(evidence, "temporary");
await mkdir(temporary);
const powershell = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
type Probe = { exit: number | null; passed: boolean; log: string };
type Candidate = {
  name: "embedded-bytecode" | "embedded-source" | "split-esm";
  status: string;
  payload: string;
  inventory?: Record<string, string>;
  sizes?: {
    total: number;
    zip: number;
    launcher: number;
    bun: number | null;
    js: number | null;
    herdr: number;
  };
  build?: {
    copyMs: number;
    jsMs: number;
    launcherMs: number;
    sealMs: number;
    archiveMs: number;
    totalMs: number;
  };
  probes: Record<string, Probe>;
  startup?: Record<string, { samples: number[]; medianMs: number; p95Ms: number }>;
  daemonReadyMs?: number;
  error?: string;
};
const results: Candidate[] = [];
const preparation: Record<string, number> = {};
if (process.env.RAYPX_SPLIT_REFERENCE_MS)
  preparation.productionReferenceMs = Number(process.env.RAYPX_SPLIT_REFERENCE_MS);
const rustPin = (
  Bun.TOML.parse(await readFile(join(root, "rust-toolchain.toml"), "utf8")) as {
    toolchain: { channel: string };
  }
).toolchain.channel;
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const env = {
  ...process.env,
  TEMP: temporary,
  TMP: temporary,
  TMPDIR: temporary,
  BUN_INSTALL_CACHE_DIR: join(temporary, "cache"),
};
const run = async (
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
) => {
  const child = Bun.spawn(args, {
    cwd: options.cwd ?? root,
    env: options.env ?? env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
    timeout: options.timeout ?? 180_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit };
};
const rust = await run(["rustc", `+${rustPin}`, "--version"]);
if (rust.exit !== 0 || !rust.stdout.startsWith(`rustc ${rustPin} `))
  throw new Error("The repository's pinned Rust compiler is unavailable");
const compiler = {
  bun: Bun.version,
  bunRevision: Bun.revision,
  bunSha256: hash(await readFile(process.execPath)),
  rust: rust.stdout.trim(),
};
const mib = (value?: number | null) =>
  value === null || value === undefined ? "unavailable" : (value / 1024 ** 2).toFixed(2);
const ms = (value?: number) => (value === undefined ? "unavailable" : value.toFixed(1));
async function persist() {
  await writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        format: 1,
        platform: process.platform,
        arch: process.arch,
        identity,
        compiler,
        preparation,
        runner: {
          os: process.env.RUNNER_OS,
          image: process.env.ImageOS,
          imageVersion: process.env.ImageVersion,
          run: process.env.GITHUB_RUN_ID,
        },
        warmups: 4,
        samples: 25,
        results,
      },
      null,
      2,
    ) + "\n",
  );
  const baseline = results[0];
  const delta = (value?: number, base?: number) =>
    value === undefined || base === undefined
      ? "unavailable"
      : `${((value / base - 1) * 100).toFixed(1)}%`;
  const rows = results.map(
    (c) =>
      `| ${c.name} | ${mib(c.sizes?.total)} | ${mib(c.sizes?.zip)} | ${delta(c.sizes?.zip, baseline?.sizes?.zip)} | ${ms(c.build?.totalMs)} | ${c.status} |`,
  );
  const components = results.map(
    (c) =>
      `| ${c.name} | ${mib(c.sizes?.launcher)} | ${mib(c.sizes?.bun)} | ${mib(c.sizes?.js)} | ${mib(c.sizes?.herdr)} |`,
  );
  const timing = results.map(
    (c) =>
      `| ${c.name} | ${["version", "providers", "models"]
        .map((p) => {
          const t = c.startup?.[p];
          return t ? `${ms(t.medianMs)} / ${ms(t.p95Ms)}` : "unavailable";
        })
        .join(" | ")} | ${ms(c.daemonReadyMs)} |`,
  );
  const builds = results.map(
    (c) =>
      `| ${c.name} | ${[
        c.build?.copyMs,
        c.build?.jsMs,
        c.build?.launcherMs,
        c.build?.sealMs,
        c.build?.archiveMs,
      ]
        .map(ms)
        .join(" | ")} |`,
  );
  const probes = results.flatMap((c) =>
    Object.entries(c.probes).map(
      ([name, p]) => `| ${c.name} | ${name} | ${p.passed ? "passed" : "failed"} | ${p.exit} |`,
    ),
  );
  const split = results.find((c) => c.name === "split-esm");
  const conclusion =
    split?.status === "accepted" && baseline?.status === "accepted"
      ? `Split payload: ${delta(split.sizes?.total, baseline.sizes?.total)} installed bytes; ${delta(split.sizes?.zip, baseline.sizes?.zip)} ZIP bytes. Functional CLI/daemon gates passed. Review startup costs and distribution complexity before a separate Desktop trial; production remains embedded Bun.`
      : "The split candidate cannot replace production unless all functional gates and the baseline pass. Missing or failed checks are not acceptance. Production remains embedded Bun.";
  await writeFile(
    join(evidence, "report.md"),
    `# Windows Bun distribution comparison\n\nCommit: ${identity.commit}. Bun: ${Bun.version} (${Bun.revision}). Rust: ${compiler.rust}. Unsigned experimental payloads.\n\n` +
      `| Candidate | Complete MiB | ZIP MiB | ZIP vs A | Build ms | Status |\n| --- | ---: | ---: | ---: | ---: | --- |\n${rows.join("\n")}\n\n` +
      `Components overlap the complete payload and must not be added to it. A/B's launcher includes Bun and JS; separate components are unavailable.\n\n| Candidate | Launcher MiB | Bun MiB | JS MiB | Herdr MiB |\n| --- | ---: | ---: | ---: | ---: |\n${components.join("\n")}\n\n` +
      `Build phases (ms), fresh direct compiler invocations without VP/Cargo cache. Common prepared Herdr/dependencies are excluded equally; common preparation appears in JSON. ZIP uses .NET Optimal with sorted entries and fixed timestamps.\n\n| Candidate | Resource copy | JS build | Launcher build | Seal | ZIP |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${builds.join("\n")}\n\n` +
      `Warm filesystem launches: 4 warmups, 25 interleaved samples; median / P95 ms. First daemon readiness includes its immutable payload copy and profile ACL checks, after enrollment/connector setup. This is not a cold OS boot benchmark.\n\n| Candidate | Version | Providers | Models | First daemon ready ms |\n| --- | ---: | ---: | ---: | ---: |\n${timing.join("\n")}\n\n` +
      `| Candidate | Gate | Result | Exit |\n| --- | --- | --- | ---: |\n${probes.join("\n")}\n\n${conclusion}\n\nDesktop installation, signatures, updater and other platforms were not tested. Logs and immutable inventories accompany this report; no production pin or packaging selection changes.\n`,
  );
}
async function probe(
  c: Candidate,
  name: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
  marker?: string,
) {
  console.log(`${c.name}/${name}: running`);
  const output = await run(args, options);
  const log = `${c.name}-${name}.log`;
  await writeFile(join(evidence, log), output.stdout + output.stderr);
  c.probes[name] = {
    exit: output.exit,
    passed: output.exit === 0 && (!marker || output.stdout.includes(marker)),
    log,
  };
  await persist();
  console.log(`${c.name}/${name}: ${c.probes[name].passed ? "passed" : "failed"}`);
  return c.probes[name].passed;
}
try {
  const started = performance.now();
  const license = await fetch(
    `https://raw.githubusercontent.com/oven-sh/bun/bun-v${Bun.version}/LICENSE.md`,
  );
  if (!license.ok) throw new Error(`Pinned Bun license download failed (${license.status})`);
  const bunLicense = await license.text();
  if (!bunLicense.includes("MIT")) throw new Error("Unexpected Bun license response");
  const fixture = join(temporary, "offline-package");
  await mkdir(join(fixture, "tool"), { recursive: true });
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({ private: true, dependencies: { "raypx-split-local": "file:./tool" } }),
  );
  await writeFile(
    join(fixture, "tool/package.json"),
    JSON.stringify({
      name: "raypx-split-local",
      version: "0.0.0",
      bin: { "raypx-split-local": "main.js" },
    }),
  );
  await writeFile(
    join(fixture, "tool/main.js"),
    '#!/usr/bin/env bun\nconsole.log("RAYPX_SPLIT_BUNX_OK", Bun.revision);\n',
  );
  const install = await run([process.execPath, "install", "--offline", "--ignore-scripts"], {
    cwd: fixture,
  });
  if (install.exit !== 0) throw new Error("Offline bunx fixture preparation failed");
  preparation.fixtureAndLicenseMs = performance.now() - started;
  const source = join(root, cli.path, "src/main.ts");
  const launcherSource = join(import.meta.dirname, "bun-split-launcher.rs");
  const launcherEnv = {
    ...env,
    RAYPX_SPLIT_VERSION: identity.version,
    RAYPX_SPLIT_BUILT_AT: String(identity.builtAt),
  };
  const testLauncher = join(temporary, "launcher-tests.exe");
  const launcherTestsStarted = performance.now();
  const testBuild = await run(
    ["rustc", `+${rustPin}`, "--edition=2024", "--test", launcherSource, "-o", testLauncher],
    { env: launcherEnv },
  );
  await writeFile(join(evidence, "launcher-tests-build.log"), testBuild.stdout + testBuild.stderr);
  if (testBuild.exit !== 0) throw new Error("Launcher test compilation failed");
  const launcherTests = await run([testLauncher]);
  await writeFile(
    join(evidence, "launcher-tests.log"),
    launcherTests.stdout + launcherTests.stderr,
  );
  if (launcherTests.exit !== 0) throw new Error("Launcher ABI/quoting tests failed");
  preparation.launcherTestsMs = performance.now() - launcherTestsStarted;
  const zipScript = join(temporary, "archive.ps1");
  await writeFile(
    zipScript,
    `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$source = $env:RAYPX_SPLIT_ZIP_SOURCE
$zip = [IO.Compression.ZipFile]::Open($env:RAYPX_SPLIT_ZIP_OUTPUT, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in (Get-ChildItem -LiteralPath $source -Recurse -File | Sort-Object FullName)) {
    $name = $file.FullName.Substring($source.Length + 1).Replace('\\', '/')
    $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
    $entry.LastWriteTime = [DateTimeOffset]::new(2000,1,1,0,0,0,[TimeSpan]::Zero)
    $sourceStream = [IO.File]::OpenRead($file.FullName)
    try {
      $entryStream = $entry.Open()
      try { $sourceStream.CopyTo($entryStream) } finally { $entryStream.Dispose() }
    } finally { $sourceStream.Dispose() }
  }
} finally { $zip.Dispose() }
`,
  );
  for (const name of ["embedded-bytecode", "embedded-source", "split-esm"] as const) {
    const c: Candidate = { name, status: "building", payload: join(evidence, name), probes: {} };
    results.push(c);
    await persist();
    try {
      const start = performance.now();
      await mkdir(c.payload);
      for (const entry of await readdir(prepared)) {
        if (entry === "raypx.exe" || entry === "runtime.json") continue;
        await cp(join(prepared, entry), join(c.payload, entry), { recursive: true });
      }
      let copyMs = performance.now() - start;
      const binary = join(c.payload, "raypx.exe");
      const split = name === "split-esm";
      const jsStart = performance.now();
      const built = await Bun.build({
        entrypoints: [source],
        target: "bun",
        format: "esm",
        minify: true,
        ...(split
          ? { outdir: c.payload, naming: "cli.js" }
          : {
              compile: { outfile: binary },
              bytecode: name === "embedded-bytecode",
              ...(name === "embedded-bytecode" ? { bytecodeDepth: 0 } : {}),
            }),
        define: {
          __RAYPX_CLI_BUILT_AT__: String(identity.builtAt),
          __RAYPX_CLI_EXTERNAL_BUN__: String(split),
        },
      });
      await writeFile(join(evidence, `${name}-build.log`), built.logs.map(String).join("\n"));
      if (!built.success) throw new Error("Candidate JavaScript build failed");
      const jsMs = performance.now() - jsStart;
      let launcherMs = 0;
      if (split) {
        const launcherStart = performance.now();
        const launcher = await run(
          [
            "rustc",
            `+${rustPin}`,
            "--edition=2024",
            "-C",
            "opt-level=z",
            "-C",
            "panic=abort",
            "-C",
            "strip=symbols",
            "-C",
            "target-feature=+crt-static",
            launcherSource,
            "-o",
            binary,
          ],
          { env: launcherEnv },
        );
        await writeFile(
          join(evidence, `${name}-launcher-build.log`),
          launcher.stdout + launcher.stderr,
        );
        if (launcher.exit !== 0) throw new Error("Native launcher compilation failed");
        // MSVC can emit a linker PDB even with stripped symbols; it is not a runtime resource.
        await rm(join(c.payload, "raypx.pdb"), { force: true });
        launcherMs = performance.now() - launcherStart;
        const runtimeCopyStarted = performance.now();
        await cp(process.execPath, join(c.payload, "bun.exe"));
        await writeFile(join(c.payload, "BUN-LICENSE.md"), bunLicense);
        await writeFile(
          join(c.payload, "README.txt"),
          "Raypx experimental split distribution. Run raypx.exe; keep bun.exe, cli.js, herdr/ and runtime.json together. No global Bun or Node runtime is required. Not a production release.\n",
        );
        copyMs += performance.now() - runtimeCopyStarted;
      }
      const sealStart = performance.now();
      const sealed = await sealCliPayload(c.payload, identity);
      await verifyCliPayload(c.payload);
      const sealMs = performance.now() - sealStart;
      c.inventory = sealed.files;
      const archiveStart = performance.now();
      const zipPath = join(evidence, `${name}.zip`);
      const zipped = await run([powershell, "-NoProfile", "-NonInteractive", "-File", zipScript], {
        env: { ...env, RAYPX_SPLIT_ZIP_SOURCE: c.payload, RAYPX_SPLIT_ZIP_OUTPUT: zipPath },
      });
      await writeFile(join(evidence, `${name}-archive.log`), zipped.stdout + zipped.stderr);
      if (zipped.exit !== 0) throw new Error("ZIP packaging failed");
      const archiveMs = performance.now() - archiveStart;
      c.build = { copyMs, jsMs, launcherMs, sealMs, archiveMs, totalMs: performance.now() - start };
      const sizes = await Promise.all(
        Object.keys(sealed.files).map(
          async (file) => [file, (await stat(join(c.payload, file))).size] as const,
        ),
      );
      c.sizes = {
        total: sizes.reduce(
          (sum, [, bytes]) => sum + bytes,
          (await stat(join(c.payload, "runtime.json"))).size,
        ),
        zip: (await stat(zipPath)).size,
        launcher: (await stat(binary)).size,
        bun: split ? (await stat(join(c.payload, "bun.exe"))).size : null,
        js: split ? (await stat(join(c.payload, "cli.js"))).size : null,
        herdr: sizes
          .filter(([file]) => file.startsWith("herdr/"))
          .reduce((sum, [, bytes]) => sum + bytes, 0),
      };
      const home = join(temporary, name);
      await mkdir(home);
      const candidateEnv = { ...env, PATH: "", RAYPX_HOME: home };
      await probe(
        c,
        "version",
        [binary, "--version"],
        { cwd: fixture, env: candidateEnv },
        identity.version,
      );
      await probe(
        c,
        "eval",
        [
          binary,
          "-e",
          'console.log("RAYPX_SPLIT_EVAL_OK", Bun.revision, process.argv[1])',
          '中文 # "quote" trailing\\',
        ],
        { cwd: fixture, env: { ...candidateEnv, BUN_BE_BUN: "1" } },
        `RAYPX_SPLIT_EVAL_OK ${Bun.revision} 中文 # "quote" trailing\\`,
      );
      await probe(
        c,
        "bunx",
        [binary, "x", "--no-install", "--bun", "raypx-split-local"],
        { cwd: fixture, env: { ...candidateEnv, BUN_BE_BUN: "1" } },
        `RAYPX_SPLIT_BUNX_OK ${Bun.revision}`,
      );
      const disposableCwd = join(temporary, `cwd 中文 # ${name}`);
      await mkdir(disposableCwd);
      await probe(
        c,
        "cwd-release",
        [
          binary,
          "-e",
          'import { rmdirSync } from "node:fs"; if (process.cwd() !== process.argv[1]) throw new Error("cwd changed"); process.chdir(process.argv[2]); rmdirSync(process.argv[1]); console.log("RAYPX_CWD_RELEASED");',
          disposableCwd,
          temporary,
        ],
        { cwd: disposableCwd, env: { ...candidateEnv, BUN_BE_BUN: "1" } },
        "RAYPX_CWD_RELEASED",
      );
      const nonzero = await run([binary, "-e", "process.exit(37)"], {
        cwd: fixture,
        env: { ...candidateEnv, BUN_BE_BUN: "1" },
      });
      const exitLog = `${name}-exit-status.log`;
      await writeFile(join(evidence, exitLog), nonzero.stdout + nonzero.stderr);
      c.probes["exit-status"] = { exit: nonzero.exit, passed: nonzero.exit === 37, log: exitLog };
      await rm(join(c.payload, "bun-node"), { recursive: true, force: true });
      await verifyCliPayload(c.payload);
      if (split) {
        for (const resource of ["bun.exe", "cli.js"]) {
          const file = join(c.payload, resource);
          await rename(file, file + ".missing");
          try {
            const missing = await run([binary, "--version"], { cwd: fixture, env: candidateEnv });
            const log = `${name}-missing-${resource}.log`;
            await writeFile(join(evidence, log), missing.stdout + missing.stderr);
            c.probes[`missing-${resource}`] = {
              exit: missing.exit,
              passed: missing.exit !== null && missing.exit !== 0,
              log,
            };
          } finally {
            await rename(file + ".missing", file);
          }
        }
      }
      await verifyCliPayload(c.payload);
      c.status = Object.values(c.probes).every((p) => p.passed) ? "probes-passed" : "probe-failed";
    } catch (error) {
      c.status = "build-or-probe-failed";
      c.error = String(error);
    }
    await persist();
    console.log(`${name}: ${c.status}`);
  }
  const timed = results.filter((c) => c.status === "probes-passed");
  for (const [name, args] of [
    ["version", ["--version"]],
    ["providers", ["ai", "providers", "--json"]],
    ["models", ["ai", "models", "--json"]],
  ] as const) {
    const samples = new Map(timed.map((c) => [c, [] as number[]]));
    for (let round = -4; round < 25; round++) {
      for (const c of round % 2 === 0 ? timed : [...timed].reverse()) {
        const start = performance.now();
        const output = await run([join(c.payload, "raypx.exe"), ...args], {
          cwd: fixture,
          env: { ...env, PATH: "", RAYPX_HOME: join(temporary, c.name) },
          timeout: 30_000,
        });
        if (output.exit !== 0) throw new Error(`Startup probe failed: ${c.name}/${name}`);
        if (round >= 0) samples.get(c)!.push(performance.now() - start);
      }
    }
    for (const [c, values] of samples) {
      const sorted = [...values].sort((a, b) => a - b);
      (c.startup ??= {})[name] = { samples: values, medianMs: sorted[12]!, p95Ms: sorted[23]! };
    }
    await persist();
  }
  for (const c of timed) {
    const candidateEnv = {
      ...env,
      RAYPX_CLI_PAYLOAD: c.payload,
      RAYPX_HERDR_COMPILED: "1",
      RAYPX_HERDR_BINARY: undefined,
      RAYPX_SPLIT_DAEMON_TIMING: join(evidence, `${c.name}-daemon-ready.json`),
    };
    const tests = [
      ["artifact", "tests/smoke/artifact.ts"],
      ["herdr", "tests/smoke/herdr-terminal.ts"],
      ["windows-payload", "tests/smoke/windows-payload.ts"],
      ["launcher-lifecycle", "tests/smoke/launcher-lifecycle.ts"],
    ] as const;
    for (const [name, file] of tests) {
      await probe(c, name, [process.execPath, join(root, cli.path, file)], {
        env: {
          ...candidateEnv,
          ...(name === "herdr"
            ? { PATH: "", RAYPX_HERDR_BINARY: join(c.payload, "herdr/herdr.exe") }
            : {}),
        },
        timeout: 300_000,
      });
    }
    const daemonFile = Bun.file(candidateEnv.RAYPX_SPLIT_DAEMON_TIMING);
    if (await daemonFile.exists())
      c.daemonReadyMs = ((await daemonFile.json()) as { readyMs: number }).readyMs;
    await verifyCliPayload(c.payload);
    c.status = Object.values(c.probes).every((p) => p.passed) ? "accepted" : "acceptance-failed";
    await persist();
    console.log(`${c.name}: ${c.status}`);
  }
  const finalPrepared = await verifyCliPayload(prepared);
  if (JSON.stringify(finalPrepared) !== JSON.stringify(identity))
    throw new Error("Prepared production payload changed");
  if (results.length !== 3 || results.some((c) => c.status !== "accepted")) process.exitCode = 1;
} catch (error) {
  await writeFile(join(evidence, "controller-error.log"), String(error));
  process.exitCode = 1;
} finally {
  await persist();
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log(`Split runtime evidence: ${evidence}`);
}
