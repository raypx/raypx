import { cp, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { taskModel } from "@raypx/task-graph/model";
import { sealCliPayload, verifyCliPayload } from "@raypx/tooling/build/cli";
import { readBunPin } from "./toolchain.js";

/** Experimental payloads never replace the prepared production payload. */
export async function experimentCliSize(root: string, supplied: string[]) {
  if (
    !supplied[0] ||
    (supplied.length !== 1 && !(supplied.length === 3 && supplied[1] === "--upx" && supplied[2]))
  )
    throw new Error(
      "Usage: raypx-dev cli:experiment <prepared CLI directory> [--upx <executable>]",
    );
  const upx = supplied[2];
  const payload = resolve(supplied[0]);
  const identity = await verifyCliPayload(payload, {
    platform: process.platform,
    arch: process.arch,
    bunVersion: Bun.version,
  });
  if (Bun.version !== readBunPin(root))
    throw new Error("Use the repository's pinned Bun for size experiments");
  const member = taskModel(root).members.find((candidate) => candidate.name === "cli");
  if (!member) throw new Error("CLI workspace is unavailable");
  const output = join(root, ".artifacts/cli-size");
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, `${process.platform}-${process.arch}-`));
  const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
  type Mode = {
    name: string;
    bytecode: boolean;
    depth?: number;
    strip?: boolean;
    minify?: boolean;
    pack?: boolean;
  };
  const modes: Mode[] = [
    { name: "full-bytecode", bytecode: true },
    { name: "depth-0", bytecode: true, depth: 0 },
    { name: "depth-1", bytecode: true, depth: 1 },
    { name: "depth-2", bytecode: true, depth: 2 },
    { name: "source", bytecode: false },
    { name: "unminified", bytecode: true, minify: false },
    ...(upx
      ? [
          { name: "upx-fast", bytecode: true, pack: true },
          { name: "depth-0-upx", bytecode: true, depth: 0, pack: true },
        ]
      : []),
    ...(process.platform === "win32"
      ? []
      : [
          { name: "full-bytecode-strip", bytecode: true, strip: true },
          { name: "depth-0-strip", bytecode: true, depth: 0, strip: true },
          { name: "source-strip", bytecode: false, strip: true },
        ]),
  ];
  type Result = {
    mode: Mode;
    payload: string;
    status: string;
    bytes?: number;
    gzipBytes?: number;
    buildMs?: number;
    timings?: Record<string, { medianMs: number; p95Ms: number }>;
  };
  const results: Result[] = [];
  const evidence = () =>
    writeFile(
      join(directory, "results.json"),
      JSON.stringify(
        {
          bun: Bun.version,
          platform: process.platform,
          arch: process.arch,
          identity,
          samples: 25,
          warmups: 4,
          results,
        },
        null,
        2,
      ) + "\n",
    );
  const run = (command: string[], env = process.env) => {
    const result = Bun.spawnSync(command, {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    if (result.exitCode !== 0)
      throw new Error(`Experiment command failed: ${command[0]} (exit ${result.exitCode})`);
    return result;
  };
  for (const mode of modes) {
    const destination = join(directory, mode.name);
    const result: Result = { mode, payload: destination, status: "building" };
    results.push(result);
    await evidence();
    try {
      await cp(payload, destination, { recursive: true });
      const binary = join(destination, executable);
      const started = performance.now();
      const build = await Bun.build({
        entrypoints: [join(root, member.path, "src/main.ts")],
        compile: { outfile: binary },
        target: "bun",
        format: "esm",
        minify: mode.minify ?? true,
        bytecode: mode.bytecode,
        ...(mode.depth === undefined ? {} : { bytecodeDepth: mode.depth }),
        define: { __RAYPX_CLI_BUILT_AT__: String(identity.builtAt) },
      });
      if (!build.success) throw new AggregateError(build.logs, "Candidate compilation failed");
      if (mode.strip) {
        run([
          "strip",
          ...(process.platform === "darwin" ? ["-S", "-x"] : ["--strip-unneeded"]),
          binary,
        ]);
        if (process.platform === "darwin") run(["codesign", "--force", "--sign", "-", binary]);
      }
      if (mode.pack && upx) run([upx, "-1", "--overlay=copy", binary]);
      result.buildMs = performance.now() - started;
      await sealCliPayload(destination, identity);
      await verifyCliPayload(destination);
      if (run([binary, "--version"]).stdout.toString().trim() !== identity.version)
        throw new Error("Candidate no longer starts the embedded Raypx application");
      const runtime = run([binary, "--version"], { ...process.env, BUN_BE_BUN: "1" });
      if (runtime.stdout.toString().trim() !== Bun.version)
        throw new Error("Candidate no longer provides the bundled Bun runtime");
      result.bytes = (await stat(binary)).size;
      result.gzipBytes = Bun.gzipSync(await readFile(binary), { level: 9 }).byteLength;
      result.status = "built";
    } catch (error) {
      result.status = error instanceof Error ? error.message : "Candidate failed";
    }
    await evidence();
    console.log(`${mode.name}: ${result.status}; ${result.bytes ?? "unavailable"} bytes`);
  }
  const probes = [
    ["version", ["--version"]],
    ["providers", ["ai", "providers", "--json"]],
    ["models", ["ai", "models", "--json"]],
  ] as const;
  const built = results.filter((result) => result.status === "built");
  const home = join(directory, "private-home");
  await mkdir(home, { recursive: true });
  const env = { ...process.env, RAYPX_HOME: home };
  for (const [probe, args] of probes) {
    const samples = new Map(built.map((result) => [result, [] as number[]]));
    for (let round = -4; round < 25; round++) {
      for (const result of round % 2 === 0 ? built : [...built].reverse()) {
        const started = performance.now();
        run([join(result.payload, executable), ...args], env);
        if (round >= 0) samples.get(result)!.push(performance.now() - started);
      }
    }
    for (const [result, values] of samples) {
      values.sort((a, b) => a - b);
      (result.timings ??= {})[probe] = { medianMs: values[12]!, p95Ms: values[23]! };
    }
    await evidence();
  }
  const mib = (bytes?: number) =>
    bytes === undefined ? "unavailable" : (bytes / 1024 ** 2).toFixed(2);
  const rows = results.map((result) =>
    [
      result.mode.name,
      mib(result.bytes),
      mib(result.gzipBytes),
      ...probes.map(([probe]) => result.timings?.[probe]?.medianMs.toFixed(1) ?? "unavailable"),
      result.status,
    ].join(" | "),
  );
  await writeFile(
    join(directory, "report.md"),
    [
      `# CLI size experiment (${process.platform}/${process.arch})`,
      "",
      `Bun ${Bun.version}; payload commit ${identity.commit}.`,
      "",
      "Each variant compiles the same source and retains the complete Herdr payload and embedded Bun runtime.",
      "Sizes below describe the CLI executable. Gzip uses level 9; installers may use different compression.",
      "Timings are warm process launches (25 interleaved samples after 4 warmups), not Agent throughput.",
      "",
      "| Mode | Executable MiB | Gzip MiB | Version ms | Providers ms | Models ms | Result |",
      "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
      ...rows.map((row) => `| ${row} |`),
      "",
    ].join("\n"),
  );
  console.log(`CLI size experiment: ${directory}`);
  return directory;
}
