import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sealCliPayload, verifyCliPayload } from "../build/cli.js";
import { taskModel } from "../tasks/model.js";
import { readBunPin } from "./toolchain.js";

// Run with pinned Bun; the supplied compiler only builds isolated experiments.
const root = resolve(import.meta.dirname, "../../../..");
const compiler = process.argv[2];
const prepared = process.argv[3];
if (!compiler || !prepared || process.argv.length !== 4)
  throw new Error("Usage: bun bun-aot.ts <experimental Bun> <prepared CLI directory>");
if (Bun.version !== readBunPin(root)) throw new Error("Use the pinned Bun to run experiments");
const payload = resolve(prepared);
const identity = await verifyCliPayload(payload, {
  platform: process.platform,
  arch: process.arch,
  bunVersion: Bun.version,
});
const cli = taskModel(root).members.find((member) => member.name === "cli");
if (!cli) throw new Error("CLI workspace is unavailable");
const parent = join(root, ".artifacts/bun-aot");
await mkdir(parent, { recursive: true });
const evidence = await mkdtemp(join(parent, `${process.platform}-${process.arch}-`));
const temporary = await mkdtemp(join(tmpdir(), "raypx-aot-"));
const binaryName = process.platform === "win32" ? "raypx.exe" : "raypx";
const run = (args: string[], cwd: string, env = process.env, timeout = 180_000) =>
  Bun.spawnSync(args, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout });
const text = (value: Uint8Array) => Buffer.from(value).toString("utf8");
const results: {
  name: string;
  payload?: string;
  status: string;
  bytes?: number;
  gzipBytes?: number;
  buildMs?: number;
  startup?: Record<string, { samples: number; medianMs: number; p95Ms: number }>;
  probes?: Record<string, { exit: number | null; passed: boolean; stdout: string; stderr: string }>;
}[] = [];
const revision = text(run([compiler, "--revision"], temporary).stdout).trim();
const compilerHash = text(run([compiler, "-p", "Bun.revision"], temporary).stdout).trim();
const help = run([compiler, "compile", "--help"], temporary);
if (help.exitCode !== 0 || !text(help.stdout).includes("--aot"))
  throw new Error("The experimental compiler does not expose AOT");
const persist = () =>
  writeFile(
    join(evidence, "results.json"),
    JSON.stringify(
      {
        bun: Bun.version,
        revision,
        platform: process.platform,
        arch: process.arch,
        identity,
        results,
      },
      null,
      2,
    ) + "\n",
  );
try {
  const reference = join(payload, binaryName);
  results.push({
    name: "prepared-stable-cli",
    status: "reference",
    bytes: (await stat(reference)).size,
    gzipBytes: Bun.gzipSync(await readFile(reference), { level: 9 }).byteLength,
  });
  const driver = join(temporary, "build.ts");
  await writeFile(
    driver,
    "const result = await Bun.build(JSON.parse(await Bun.file(process.argv[2]).text()));\nfor (const log of result.logs) console.error(log);\nif (!result.success) process.exit(1);\n",
  );
  const hello = join(temporary, "hello.ts");
  await writeFile(hello, 'console.log("RAYPX_AOT_PROGRAM_OK");\n');
  const feature = join(temporary, "features.ts");
  await writeFile(
    feature,
    `import { Database } from "bun:sqlite";
const db = new Database(":memory:");
const row = db.query("select 42 as value").get() as { value: number };
db.close();
if (row.value !== 42) throw new Error("SQLite failed");
const child = Bun.spawnSync(process.platform === "win32" ? ["cmd.exe", "/d", "/c", "echo RAYPX_AOT_CHILD_OK"] : ["/bin/sh", "-c", "printf RAYPX_AOT_CHILD_OK"], { stdout: "pipe", stderr: "pipe" });
if (child.exitCode !== 0 || !child.stdout.toString().includes("RAYPX_AOT_CHILD_OK")) throw new Error("Spawn failed");
const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("RAYPX_AOT_HTTP_OK") });
try { if (await (await fetch(server.url)).text() !== "RAYPX_AOT_HTTP_OK") throw new Error("HTTP failed"); }
finally { server.stop(true); }
console.log("RAYPX_AOT_FEATURES_OK");
`,
  );
  const fixture = join(temporary, "package");
  await mkdir(join(fixture, "tool"), { recursive: true });
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({ private: true, dependencies: { "raypx-aot-local": "file:./tool" } }),
  );
  await writeFile(
    join(fixture, "tool/package.json"),
    JSON.stringify({
      name: "raypx-aot-local",
      version: "0.0.0",
      bin: { "raypx-aot-local": "main.js" },
    }),
  );
  await writeFile(
    join(fixture, "tool/main.js"),
    '#!/usr/bin/env bun\nconsole.log("RAYPX_AOT_BUNX_OK", Bun.revision);\n',
  );
  const fixtureEnv = { ...process.env, BUN_INSTALL_CACHE_DIR: join(temporary, "cache") };
  const install = run(
    [process.execPath, "install", "--offline", "--ignore-scripts"],
    fixture,
    fixtureEnv,
  );
  if (install.exitCode !== 0) throw new Error("Cannot prepare the offline bunx fixture");
  const bundled = join(temporary, "raypx-bundle.js");
  const bundle = await Bun.build({
    entrypoints: [join(root, cli.path, "src/main.ts")],
    target: "bun",
    format: "esm",
    minify: false,
    define: { __RAYPX_CLI_BUILT_AT__: String(identity.builtAt) },
  });
  if (!bundle.success)
    throw new AggregateError(bundle.logs, "Cannot prepare the JavaScript bundle");
  await writeFile(bundled, await bundle.outputs[0]!.text());
  const source = join(root, cli.path, "src/main.ts");
  const tsconfig = join(evidence, "tsconfig.aot.json");
  await writeFile(
    tsconfig,
    JSON.stringify({
      extends: join(root, cli.path, "tsconfig.json"),
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        moduleDetection: "force",
        customConditions: ["bun"],
      },
      files: [source],
      include: [],
    }),
  );
  const retainRuntime = {
    aot: true,
    // Inspector admission keeps every Program API required by arbitrary child code.
    inspector: true,
    trim: { allow: ["cli", "interpreter", "jit"] },
    allowCodeFromDisk: true,
    autoloadPackageJson: true,
    autoloadTsconfig: true,
  };
  const modes = [
    {
      name: "stable-floor",
      compiler: process.execPath,
      source: hello,
      options: {},
      bytecode: true,
    },
    { name: "canary-jit-floor", compiler, source: hello, options: {}, bytecode: true },
    { name: "aot-floor", compiler, source: hello, options: { aot: true } },
    { name: "aot-trim-floor", compiler, source: hello, options: { aot: true, trim: true } },
    {
      name: "aot-keep-cli-floor",
      compiler,
      source: hello,
      options: { aot: true, trim: { allow: ["cli"] } },
    },
    { name: "aot-features", compiler, source: feature, options: { aot: true, trim: true } },
    { name: "aot-runtime-floor", compiler, source: hello, options: retainRuntime },
    { name: "aot-source", compiler, source, options: { aot: true }, cli: true },
    { name: "aot-source-trim", compiler, source, options: { aot: true, trim: true }, cli: true },
    {
      name: "aot-source-keep-cli",
      compiler,
      source,
      options: { aot: true, trim: { allow: ["cli"] } },
      cli: true,
    },
    {
      name: "aot-source-override-trim",
      compiler,
      source,
      tsconfig,
      options: { aot: true, trim: true },
      cli: true,
    },
    {
      name: "aot-source-override-runtime",
      compiler,
      source,
      tsconfig,
      options: retainRuntime,
      cli: true,
    },
    {
      name: "aot-bundle-trim",
      compiler,
      source: bundled,
      options: { aot: true, trim: true },
      cli: true,
    },
    {
      name: "aot-bundle-runtime",
      compiler,
      source: bundled,
      options: retainRuntime,
      cli: true,
    },
    {
      name: "aot-bundle-keep-cli",
      compiler,
      source: bundled,
      options: { aot: true, trim: { allow: ["cli"] } },
      cli: true,
    },
  ];
  for (const mode of modes) {
    const directory = join(evidence, mode.name);
    await mkdir(directory, { recursive: true });
    if (mode.cli) await cp(payload, directory, { recursive: true });
    const binary = join(directory, binaryName);
    const config = join(temporary, `${mode.name}.json`);
    await writeFile(
      config,
      JSON.stringify({
        entrypoints: [mode.source],
        target: "bun",
        format: "esm",
        minify: true,
        ...(mode.tsconfig ? { tsconfig: mode.tsconfig } : {}),
        ...(mode.bytecode ? { bytecode: true, bytecodeDepth: 0 } : {}),
        define: { __RAYPX_CLI_BUILT_AT__: String(identity.builtAt) },
        compile: { outfile: binary, ...mode.options },
      }),
    );
    const result: (typeof results)[number] = {
      name: mode.name,
      status: "building",
      ...(mode.cli ? { payload: directory } : {}),
    };
    results.push(result);
    await persist();
    const started = performance.now();
    const build = run([mode.compiler, driver, config], root);
    result.buildMs = performance.now() - started;
    await writeFile(join(directory, "build.log"), text(build.stdout) + text(build.stderr));
    if (build.exitCode !== 0) {
      result.status = build.signalCode
        ? `build-${build.signalCode}`
        : `build-exit-${build.exitCode}`;
      await persist();
      console.log(`${mode.name}: ${result.status}`);
      continue;
    }
    result.bytes = (await stat(binary)).size;
    result.gzipBytes = Bun.gzipSync(await readFile(binary), { level: 9 }).byteLength;
    if (mode.cli) await sealCliPayload(directory, identity);
    const home = join(temporary, mode.name);
    await mkdir(home, { recursive: true });
    const env = { ...fixtureEnv, RAYPX_HOME: home };
    const probes = mode.cli
      ? ([
          ["version", ["--version"], identity.version],
          ["providers", ["ai", "providers", "--json"], "openai"],
          ["models", ["ai", "models", "--json"], "openai"],
        ] as const)
      : ([
          [
            "program",
            [],
            mode.source === feature ? "RAYPX_AOT_FEATURES_OK" : "RAYPX_AOT_PROGRAM_OK",
          ],
        ] as const);
    result.probes = {};
    for (const [name, args, marker] of [
      ...probes,
      ["bun-eval", ["-e", 'console.log("RAYPX_AOT_EVAL_OK")'], "RAYPX_AOT_EVAL_OK"],
      ["bunx", ["x", "--no-install", "--bun", "raypx-aot-local"], "RAYPX_AOT_BUNX_OK"],
    ] as const) {
      const runtime = name === "bun-eval" || name === "bunx";
      const probe = run(
        [binary, ...args],
        fixture,
        { ...env, ...(runtime ? { BUN_BE_BUN: "1" } : {}) },
        30_000,
      );
      const stdout = text(probe.stdout);
      result.probes[name] = {
        exit: probe.exitCode,
        passed:
          probe.exitCode === 0 &&
          stdout.includes(marker) &&
          (name !== "bunx" ||
            stdout.includes(mode.compiler === process.execPath ? Bun.revision : compilerHash)),
        stdout: stdout.slice(0, 4000),
        stderr: text(probe.stderr).slice(0, 4000),
      };
    }
    if (mode.cli) {
      // Windows bunx bootstraps runtime aliases beside the experimental executable.
      // They are probe outputs, not part of the sealed payload handed to acceptance.
      if (process.platform === "win32")
        await rm(join(directory, "bun-node"), { recursive: true, force: true });
      await verifyCliPayload(directory);
    }
    result.status = Object.values(result.probes).every((probe) => probe.passed)
      ? "probes-passed"
      : "probe-failed";
    await persist();
    console.log(`${mode.name}: ${result.status}; ${(result.bytes / 1024 ** 2).toFixed(2)} MiB`);
  }
  // Interleave warm launches on the same runner; only time CLI commands that passed.
  const timed = [
    { result: results[0]!, binary: reference },
    ...results
      .filter(
        (result) =>
          result.payload &&
          result.probes?.version?.passed &&
          result.probes.providers?.passed &&
          result.probes.models?.passed,
      )
      .map((result) => ({ result, binary: join(result.payload!, binaryName) })),
  ];
  const timingHome = join(temporary, "timing-home");
  await mkdir(timingHome);
  for (const [name, args] of [
    ["version", ["--version"]],
    ["providers", ["ai", "providers", "--json"]],
    ["models", ["ai", "models", "--json"]],
  ] as const) {
    const samples = new Map(timed.map((candidate) => [candidate, [] as number[]]));
    for (let round = -4; round < 25; round++) {
      for (const candidate of round % 2 === 0 ? timed : [...timed].reverse()) {
        const start = performance.now();
        const probe = run(
          [candidate.binary, ...args],
          fixture,
          { ...fixtureEnv, RAYPX_HOME: timingHome },
          10_000,
        );
        if (probe.exitCode !== 0)
          throw new Error(`Startup probe failed: ${candidate.result.name}/${name}`);
        if (round >= 0) samples.get(candidate)!.push(performance.now() - start);
      }
    }
    for (const [candidate, values] of samples) {
      values.sort((a, b) => a - b);
      (candidate.result.startup ??= {})[name] = {
        samples: values.length,
        medianMs: values[12]!,
        p95Ms: values[23]!,
      };
    }
    await persist();
  }
  const rows = results.map(
    (result) =>
      `| ${result.name} | ${result.bytes === undefined ? "unavailable" : (result.bytes / 1024 ** 2).toFixed(2)} | ${result.status} | ${Object.entries(
        result.probes ?? {},
      )
        .filter(([, probe]) => !probe.passed)
        .map(([name]) => name)
        .join(", ")} |`,
  );
  const startupRows = results
    .filter((result) => result.startup)
    .map(
      (result) =>
        `| ${result.name} | ${["version", "providers", "models"]
          .map((name) => {
            const timing = result.startup![name]!;
            return `${timing.medianMs.toFixed(1)} / ${timing.p95Ms.toFixed(1)}`;
          })
          .join(" | ")} |`,
    );
  await writeFile(
    join(evidence, "report.md"),
    `# Bun AOT experiment\n\nCompiler: ${revision}. Platform: ${process.platform}/${process.arch}. Production pin: ${Bun.version}.\n\n| Candidate | Executable MiB | Status | Failed probes |\n| --- | ---: | --- | --- |\n${rows.join("\n")}\n\nWarm process launches, 4 warmups and 25 alternating samples; median / p95 in milliseconds:\n\n| Candidate | Version | Providers | Models |\n| --- | ---: | ---: | ---: |\n${startupRows.join("\n")}\n\nThese are isolated experimental outputs. A successful build alone is not CLI/Herdr/daemon acceptance. Retaining CLI tests real eval and an offline local bunx package, not just --version. Runtime modes retain inspector support and all Program APIs; inspector is not started. Their optimization assumptions differ from default AOT.\n`,
  );
  const accepted = results
    .filter((result) => result.payload && result.status === "probes-passed")
    .sort((a, b) => a.bytes! - b.bytes!)[0];
  if (accepted?.payload && process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, `aot-payload=${accepted.payload}\n`, { flag: "a" });
  console.log(`AOT evidence: ${evidence}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
