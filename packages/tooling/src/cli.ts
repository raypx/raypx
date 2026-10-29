#!/usr/bin/env bun
import { uploadAnalyticsMaps } from "./analytics.js";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentEnvironment, run } from "@raypx-kit/devkit/process";
import type { Kind, Target } from "@raypx-kit/devkit/workspaces";
import { clean, cleanArtifacts, cleanRust } from "./clean.js";
import { checkLocales, policy } from "./policy.js";
import { discover, runTasks } from "./repository.js";
import { scaffold } from "./scaffold.js";
import { smoke } from "./smoke/index.js";
import { readBunPin } from "./validation/toolchain.js";
import { browserTestArguments } from "./browser-tests.js";
import { packageTestArguments, runTests } from "./test-command.js";
import { verify, ciGate } from "./verification/index.js";
import { readGithubPlan } from "./verification/plan.js";
import { cacheSnapshot } from "./verification/cache.js";

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
    case "test":
      await runTests(root, process.cwd(), args);
      break;
    case "package-test":
      await runTests(root, process.cwd(), packageTestArguments(args));
      break;
    case "test:inventory": {
      await runTests(root, process.cwd(), ["inventory", ...args]);
      break;
    }
    case "test:backends": {
      await runTests(root, process.cwd(), ["backends", ...args]);
      break;
    }
    case "e2e": {
      await runTests(root, process.cwd(), ["e2e", ...args]);
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
      if (!args[0]) throw new Error("Usage: raypx-dev tasks <task> [VP options]");
      await runTasks(root, args[0], args.slice(1));
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
      await verify(root, args);
      break;
    case "ci:plan": {
      const plan = readGithubPlan(root);
      console.log(JSON.stringify(plan, null, 2));
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `native=${plan.native}\nbackend=${plan.backend}\nbrowser=${plan.browser !== "none"}\nrust=${plan.rust}\ndistribution=${plan.distribution}\n`,
        );
      break;
    }
    case "ci:gate":
      await ciGate(root, args);
      break;
    case "ci:cache":
      await cacheSnapshot(root, args[0] ?? "snapshot");
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
        throw new Error("Usage: raypx-dev analytics sourcemaps <web|desktop>");
      await uploadAnalyticsMaps(root, args[1]);
      break;
    case "desktop":
      if (args[0] !== "build") throw new Error("Usage: raypx-dev desktop build");
      await runTasks(
        root,
        "desktop#native:build",
        args[1] === "--" ? args.slice(1) : ["--", ...args.slice(1)],
      );
      break;
    case "clean": {
      await clean(root);
      console.log(
        "Build outputs, staged sidecars and test artifacts removed; Rust dependency caches and Release artifacts preserved",
      );
      break;
    }
    case "clean:rust":
      await cleanRust(root);
      console.log(
        "Workspace Rust development artifacts cleaned; dependency caches and Release artifacts preserved",
      );
      break;
    case "clean:artifacts":
      await cleanArtifacts(root);
      console.log("Validation reports and test artifacts removed");
      break;
    case "doctor": {
      const bun = readBunPin(root);
      if (Bun.version !== bun) throw new Error(`Expected Bun ${bun}, got ${Bun.version}`);
      console.log(`Bun ${Bun.version}; ${process.platform}/${process.arch}`);
      console.log(
        `Desktop: MyGo; Go ${Bun.which("go") ? "available" : "unavailable"} (required for native packaging); bun run verify selects affected JS, Go and Rust checks`,
      );
      break;
    }
    case undefined:
      console.log(
        "raypx-dev: test | tasks | e2e | workspace | policy | i18n | verify | smoke | env | db | desktop | clean | clean:rust | clean:artifacts | doctor",
      );
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
