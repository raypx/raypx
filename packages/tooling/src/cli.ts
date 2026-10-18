#!/usr/bin/env bun
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentEnvironment, run } from "@voidmix/devkit/process";
import { readToolchain } from "@voidmix/devkit/toolchain";
import type { Kind, Target } from "@voidmix/devkit/workspaces";
import { checkLocales, policy } from "./policy.js";
import { discover, pinnedNode, turbo } from "./repository.js";
import { scaffold } from "./scaffold.js";
import { smoke } from "./smoke.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const [command, ...args] = process.argv.slice(2);
function findings(items: string[], label: string) {
  if (items.length)
    throw new Error(`${label} failed:\n${items.map((item) => `  ${item}`).join("\n")}`);
  console.log(`${label} passed`);
}
function option(name: string, fallback: string) {
  const offset = args.indexOf(name);
  return offset < 0 ? fallback : (args[offset + 1] ?? fallback);
}

async function main() {
  switch (command) {
    case "tasks": {
      if (!args[0]) throw new Error("Usage: raypx-dev tasks <task> [Turbo flags]");
      await turbo(root, args[0], args.slice(1));
      break;
    }
    case "workspace": {
      if (args[0] === "list") {
        const index = discover(root);
        findings(index.findings, "Workspace discovery");
        for (const w of index.workspaces)
          console.log(
            `${w.path.padEnd(25)} ${w.manifest.name.padEnd(22)} ${w.metadata?.kind}/${w.metadata?.target}`,
          );
      } else if (args[0] === "new" && args[1]) {
        const paths = scaffold(root, args[1], {
          kind: option("--kind", "library") as Kind,
          target: option("--target", "universal") as Target,
          write: args.includes("--write"),
          tests: args.includes("--tests"),
        });
        if (args.includes("--write"))
          await run(process.execPath, ["--bun", "vp", "fmt", "--write", ...paths], root);
        console.log(
          `${args.includes("--write") ? "Created" : "Preview (use --write to create)"}:\n${paths.join("\n")}`,
        );
      } else
        throw new Error(
          "Usage: raypx-dev workspace list | new <name> [--kind library] [--target universal] [--tests] [--write]",
        );
      break;
    }
    case "policy":
      findings(policy(root), "Repository policy");
      break;
    case "i18n":
      findings(checkLocales(root), "Locale catalogs");
      break;
    case "verify":
      findings(checkLocales(root), "Locale catalogs");
      findings(policy(root), "Repository policy");
      await run(process.execPath, ["--bun", "vp", "fmt", "--check"], root);
      // Type-aware lint resolves ignored SDK declarations that native:prepare generates.
      await turbo(root, "native:prepare");
      await run(process.execPath, ["--bun", "vp", "lint"], root);
      await turbo(root, "check");
      await turbo(root, "test");
      await turbo(root, "build");
      await smoke(root);
      break;
    case "smoke":
      await smoke(root);
      break;
    case "env": {
      const values = args[0] === "--" ? args.slice(1) : args;
      if (!values[0] || /^(?:rpx|raypx-dev)(?:\.exe)?$/.test(values[0]))
        throw new Error("Usage: raypx-dev env -- <external command>");
      await run(values[0], values.slice(1), process.cwd(), developmentEnvironment(root));
      break;
    }
    case "db": {
      const operation = args[0] ?? "migrate";
      const manifest = JSON.parse(readFileSync(join(root, "packages/db/package.json"), "utf8"));
      if (!["migrate", "generate", "studio"].includes(operation) || !manifest.scripts[operation])
        throw new Error(`Unsupported database operation: ${operation}`);
      await run(
        process.execPath,
        ["run", operation, ...args.slice(1)],
        join(root, "packages/db"),
        developmentEnvironment(root),
      );
      break;
    }
    case "desktop":
      if (args[0] !== "build") throw new Error("Usage: raypx-dev desktop build");
      await turbo(root, "build", ["--filter", "desktop"]);
      await run(
        process.execPath,
        ["run", "native:build"],
        join(root, "apps/desktop"),
        developmentEnvironment(root),
      );
      break;
    case "clean": {
      for (const w of discover(root).workspaces)
        for (const output of ["dist", ".output", "coverage", ".turbo"])
          rmSync(join(root, w.path, output), { recursive: true, force: true });
      rmSync(join(root, ".turbo"), { recursive: true, force: true });
      console.log("Build outputs removed; user profiles and database volumes preserved");
      break;
    }
    case "doctor": {
      const pins = readToolchain(root);
      if (Bun.version !== pins.bun) throw new Error(`Expected Bun ${pins.bun}, got ${Bun.version}`);
      pinnedNode(root);
      console.log(`Bun ${Bun.version}; Node ${pins.node}; ${process.platform}/${process.arch}`);
      console.log(
        `Native SDK prepared: ${existsSync(join(root, "apps/desktop/.hutch"))}; optional native toolchains require separate checks`,
      );
      break;
    }
    case undefined:
    default:
      console.log(
        "raypx-dev: tasks | workspace | policy | i18n | verify | smoke | env | db | desktop | clean | doctor",
      );
  }
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
