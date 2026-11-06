import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { platform, arch, release, hostname } from "node:os";
import { createHash } from "node:crypto";
import { verifyCliPayload, payloadFiles } from "../build/cli";
import { performanceEnvironment, commandQuote, comparisonEnvironment } from "./environment";
import { processAccounting } from "./attribution";
export { performanceEnvironment, commandQuote } from "./environment";

type Result = {
  stage: string;
  code: number;
  evidence: string;
  experiment?: string;
  processAccounting?: string[];
  attributionStatus?: string;
  artifactRoles?: { base: string; head: string };
  report?: string;
};
/** No builds or regression thresholds. Refusals and inconclusive intervals remain in the exported result. */
export async function runPerformance(root: string, binary: string, bench: string, args: string[]) {
  const experiment =
    new Date().toISOString().replaceAll(":", "-") + "-" + crypto.randomUUID().slice(0, 8);
  const output = join(root, ".artifacts/performance", experiment);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const target = args[0] ?? "native";
  if (!["native", "webview", "cli", "browser"].includes(target))
    throw new Error("Unknown performance target");
  const env = performanceEnvironment(process.env);
  const variants: Record<string, string> = {};
  const artifacts: Record<string, unknown> = {};
  const inventories: Record<string, () => Promise<unknown>> = {};
  for (const variant of ["base", "head"]) {
    const key = variant.toUpperCase();
    if (target === "browser") {
      const url = env[`RAYPX_STROBE_${key}_URL`];
      if (!url || new URL(url).hostname !== "127.0.0.1")
        throw new Error("Browser fixtures must use loopback");
      variants[variant] = "url:" + url;
      const directory = env[`RAYPX_STROBE_${key}_SPA`];
      if (!directory) throw new Error("Prepared SPA directory is required");
      inventories[variant] = async () => ({
        engine: "chromium",
        files: await payloadFiles(resolve(directory)),
      });
    } else {
      const exe = env[target === "cli" ? `RAYPX_STROBE_CLI_${key}` : `RAYPX_STROBE_${key}_EXE`];
      if (!exe) throw new Error(`Missing prepared ${variant} executable`);
      const payload =
        target === "cli"
          ? dirname(exe)
          : process.platform === "darwin"
            ? resolve(dirname(exe), "../Resources/bin")
            : join(dirname(exe), "bin");
      inventories[variant] = async () => ({
        cli: await verifyCliPayload(payload, { platform: process.platform, arch: process.arch }),
        executable: {
          path: exe,
          sha256: createHash("sha256")
            .update(await readFile(exe))
            .digest("hex"),
        },
      });
      variants[variant] =
        target === "cli" ? "cmd:" + commandQuote(exe) + " --version" : "app:raypx-" + variant;
    }
    artifacts[variant] = await inventories[variant]();
  }
  const common = ["bench", bench, "--target", target, "--json", "--progress", "stderr"];
  const results: Result[] = [];
  const commands: [string, string[]][] = [
    ...(target === "cli" || target === "browser"
      ? []
      : [["config", ["config", root]] as [string, string[]]]),
    ["check", [...common, "--check", "--head", variants.head!]],
    ["aa", [...common, "--aa", "--head", variants.head!]],
    ["ab", [...common, "--base", variants.base!, "--head", variants.head!]],
  ];
  try {
    for (const [stage, command] of commands) {
      const stageHome = join(output, stage + "-home");
      await mkdir(stageHome, { recursive: true, mode: 0o700 });
      const stageEnvironment = comparisonEnvironment(env, stage);
      const measurementEnvironment =
        target === "cli" ? performanceEnvironment(stageEnvironment, stageHome) : stageEnvironment;
      const child = Bun.spawn([process.execPath, binary, ...command], {
        cwd: resolve(root),
        env: measurementEnvironment,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const evidence = join(output, stage + ".txt");
      await writeFile(evidence, stdout + "\n" + stderr, { mode: 0o600 });
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      const result: Result = { stage, code, evidence };
      if (stage !== "config")
        result.artifactRoles = { base: stage === "ab" ? "base" : "head", head: "head" };
      results.push(result);
      for (const variant of ["base", "head"])
        if (JSON.stringify(await inventories[variant]!()) !== JSON.stringify(artifacts[variant]))
          throw new Error(`Strobe ${stage} changed the prepared ${variant} artifact`);
      if (stage !== "config") {
        let data: any;
        try {
          data = JSON.parse(stdout);
        } catch {
          throw new Error(`Strobe ${stage} produced no structured evidence`);
        }
        await writeFile(join(output, stage + ".json"), JSON.stringify(data, null, 2), {
          mode: 0o600,
        });
        result.experiment = data.id;
        result.processAccounting = [];
        if (target === "native" || target === "webview") {
          const accounting = processAccounting(
            data,
            target === "webview" ||
              !bench.endsWith("startup.bench.ts") ||
              !!env.RAYPX_STROBE_READY_SELECTOR,
          );
          result.processAccounting = accounting.issues;
          result.attributionStatus = accounting.status;
        }
        if (data.id) {
          result.report = join(output, stage + ".html");
          const report = Bun.spawn(
            [
              process.execPath,
              binary,
              "report",
              "experiment",
              data.id,
              "--format",
              "html",
              "--out",
              result.report,
            ],
            { cwd: root, env: measurementEnvironment, stdout: "ignore", stderr: "pipe" },
          );
          const reportError = await new Response(report.stderr).text();
          await writeFile(join(output, stage + "-report.txt"), reportError, { mode: 0o600 });
          if ((await report.exited) || !(await Bun.file(result.report).exists()))
            throw new Error(`Strobe ${stage} report export failed; see ${output}`);
        }
        if (result.processAccounting.length)
          throw new Error(
            `Process attribution is uncertain: ${result.processAccounting.join("; ")}`,
          );
      }
      if (code !== 0) throw new Error(`Strobe ${stage} failed or refused; see ${evidence}`);
    }
  } finally {
    await writeFile(
      join(output, "run.json"),
      JSON.stringify(
        {
          experiment,
          strobe: "0.13.0",
          machine: hostname(),
          os: platform(),
          osVersion: release(),
          arch: arch(),
          bun: Bun.version,
          bench,
          target,
          artifacts,
          window: "1280x800",
          gpuCache: "warm",
          results,
          webviewVersion:
            process.env.RAYPX_STROBE_WEBVIEW_VERSION ?? "see exported Strobe browser/env fields",
          regressionThreshold: null,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
}
