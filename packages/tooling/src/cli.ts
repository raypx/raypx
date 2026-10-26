#!/usr/bin/env bun
import { uploadAnalyticsMaps } from "./analytics.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentEnvironment, run } from "@raypx-kit/devkit/process";
import { readToolchain } from "@raypx-kit/devkit/toolchain";
import type { Kind, Target } from "@raypx-kit/devkit/workspaces";
import { clean } from "./clean.js";
import { checkLocales, policy } from "./policy.js";
import { discover, pinnedNode, turbo } from "./repository.js";
import { scaffold } from "./scaffold.js";
import { smoke, smokeCloudflare } from "./smoke/index.js";
import { browserTestArguments, planBrowserTests } from "./browser-tests.js";

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
    case "e2e": {
      const planned = planBrowserTests(args);
      await turbo(root, planned.task, planned.args, planned.env);
      break;
    }
    case "browser:run":
      await run(
        process.execPath,
        ["--bun", "playwright", "test", ...browserTestArguments(args, process.env)],
        process.cwd(),
      );
      break;
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
    case "verify:quick":
      findings(checkLocales(root), "Locale catalogs");
      findings(policy(root), "Repository policy");
      await run(process.execPath, ["--bun", "vp", "fmt", "--check"], root);
      // One graph shares native preparation across lint, checks and builds.
      // Start with check so verification never loads development dotenv into tests.
      await turbo(root, "check", [
        "test",
        ...(command === "verify" ? ["build", "build:cloudflare"] : []),
        "//#lint",
        "--summarize",
      ]);
      if (command === "verify") await smoke(root);
      break;
    case "smoke":
      await smoke(root);
      break;
    case "smoke:cloudflare":
      await smokeCloudflare(root);
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
      const manifest = JSON.parse(
        readFileSync(join(root, "packages/database/package.json"), "utf8"),
      );
      if (!["migrate", "generate", "studio"].includes(operation) || !manifest.scripts[operation])
        throw new Error(`Unsupported database operation: ${operation}`);
      await run(
        process.execPath,
        ["run", operation, ...args.slice(1)],
        join(root, "packages/database"),
        developmentEnvironment(root),
      );
      break;
    }
    case "analytics":
      if (args[0] !== "sourcemaps")
        throw new Error("Usage: raypx-dev analytics sourcemaps <web|web-cloudflare|desktop>");
      await uploadAnalyticsMaps(root, args[1]);
      break;
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
      await clean(root);
      console.log("Build outputs, native SDK and test artifacts removed");
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
        "raypx-dev: tasks | e2e | workspace | policy | i18n | verify | verify:quick | smoke | env | db | desktop | clean | doctor",
      );
  }
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
