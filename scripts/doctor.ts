#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { origin } from "./lib/doctor/probes.ts";
import { doctorExitCode, doctorFailureReport, formatDoctorCheck } from "./lib/doctor/report.ts";
import { runDoctor } from "./lib/doctor/run.ts";

export type {
  DoctorCheck,
  DoctorOptions,
  DoctorReport,
  DoctorStatus,
} from "./lib/doctor/report.ts";
export { doctorExitCode } from "./lib/doctor/report.ts";
export { runDoctor } from "./lib/doctor/run.ts";

const ownRoot = fileURLToPath(new URL("../", import.meta.url));
const internalFlag = "--raypx-doctor-web";

function parseArguments(args: readonly string[]): {
  json: boolean;
  database: boolean;
  probe?: string;
} {
  let json = false;
  let database = false;
  let probe: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === internalFlag) continue;
    if (argument === "--json") json = true;
    else if (argument === "--database") database = true;
    else if (argument === "--probe" && args[index + 1] !== undefined) {
      probe = origin(args[++index] ?? "");
      if (!probe) throw new Error("Invalid probe origin");
    } else throw new Error("Unsupported diagnostic argument");
  }
  return { json, database, ...(probe ? { probe } : {}) };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  try {
    const options = parseArguments(args);
    if (!args.includes(internalFlag)) {
      const child = spawnSync(
        process.execPath,
        ["--no-install", fileURLToPath(import.meta.url), internalFlag, ...args],
        {
          cwd: join(ownRoot, "apps/web"),
          stdio: "inherit",
          env: process.env,
        },
      );
      process.exitCode = child.status ?? 2;
      return;
    }
    const report = await runDoctor({ root: ownRoot, ...options });
    if (options.json) console.log(JSON.stringify(report));
    else for (const check of report.checks) console.log(formatDoctorCheck(check));
    process.exitCode = doctorExitCode(report);
  } catch {
    const report = doctorFailureReport();
    if (json) console.log(JSON.stringify(report));
    else console.error(report.checks[0]?.message);
    process.exitCode = 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
