import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { doctorFailureReport } from "../doctor/report.ts";

export const bootstrapCommands = {
  doctor: {
    description: "Diagnose tools, application configuration, and optional services.",
    script: "scripts/doctor.ts",
    options: [
      "--json             Print a sanitized machine-readable report",
      "--database         Inspect the configured database without writing",
      "--probe <origin>   Check a running service's health and readiness",
    ],
  },
  env: {
    description: "Check development tool versions and declarations.",
    script: "packages/config/src/environment.ts",
    options: [],
  },
  setup: {
    description: "Create application configuration without overwriting it.",
    script: "scripts/setup.ts",
    options: [],
  },
} as const;

export const installedCommands = {
  clean: { description: "Remove generated artifacts and local tool caches." },
  deps: { description: "Check coupled dependency versions without changing files." },
  policy: {
    description: "Check workspace registration, TypeScript inheritance, and documentation.",
  },
  verify: { description: "Run the ordered repository acceptance gates." },
  consumer: { description: "Validate public packages in independent consumer installations." },
  "consumer-browser": { description: "Exercise the independent browser consumer in Chromium." },
} as const;

export function isBootstrapCommand(
  name: string | undefined,
): name is keyof typeof bootstrapCommands {
  return name !== undefined && Object.hasOwn(bootstrapCommands, name);
}

export function toolVersion(root: string): string {
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (
    manifest &&
    typeof manifest === "object" &&
    "version" in manifest &&
    typeof manifest.version === "string"
  )
    return manifest.version;
  return "unknown";
}

/** A fresh checkout can show the command catalog before installed tooling is available. */
export function printBootstrapUsage(root: string): void {
  console.log(
    `Raypx repository tools (raypx v${toolVersion(root)})\n\nUSAGE raypx <command> [OPTIONS]\n\nCOMMANDS\n`,
  );
  for (const [name, command] of Object.entries({ ...bootstrapCommands, ...installedCommands }))
    console.log(`  ${name.padEnd(19)} ${command.description}`);
  console.log(
    "\nUse raypx <command> --help for command options. Run bun install to enable installed commands.",
  );
}

/** Preserve diagnostic output and Bun's application env bootstrap across the unified bin. */
export function runBootstrapCommand(
  name: keyof typeof bootstrapCommands,
  args: string[],
  root: string,
): void {
  const command = bootstrapCommands[name];
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(
      `${command.description}\n\nUSAGE raypx ${name}${command.options.length ? " [OPTIONS]" : ""}`,
    );
    if (command.options.length) console.log(`\nOPTIONS\n\n  ${command.options.join("\n  ")}`);
    return;
  }
  if (name !== "doctor" && args.length) {
    console.error(`Unsupported arguments for ${name}. Use raypx ${name} --help.`);
    process.exitCode = 1;
    return;
  }
  const result = spawnSync(
    process.execPath,
    ["--no-env-file", "--no-install", join(root, command.script), ...args],
    { cwd: root, env: process.env, stdio: "inherit", timeout: 120_000 },
  );
  if (result.error || result.status === null) {
    if (name === "doctor") {
      const report = doctorFailureReport();
      if (args.includes("--json")) console.log(JSON.stringify(report));
      else console.error(report.checks[0]?.message);
    } else console.error(`The ${name} command could not start.`);
    process.exitCode = name === "doctor" ? 2 : 1;
    return;
  }
  process.exitCode = result.status;
}
