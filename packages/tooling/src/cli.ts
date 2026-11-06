import { findExecutable, run } from "@raypx/runtime-node/process";
import { uploadAnalyticsMaps } from "./analytics.ts";
import { readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { developmentEnvironment } from "@raypx-kit/devkit/process";
import type { Kind, Target } from "@raypx-kit/devkit/workspaces";
import { clean, cleanArtifacts } from "./clean.ts";
import { checkLocales, policy } from "./policy.ts";
import { discover, runTasks } from "./repository.ts";
import { scaffold } from "./scaffold.ts";
import { smoke } from "./smoke/index.ts";
import { checkKnip } from "./validation/knip.ts";
import { assertNodeVersion } from "./validation/toolchain.ts";
import { browserTestArguments } from "./browser-tests.ts";
import { packageTestArguments, runTests } from "./test-command.ts";
import { verify, ciGate } from "./verification/index.ts";
import { readGithubPlan } from "./verification/plan.ts";
import { ciOutputs } from "./verification/gates.ts";
import { cacheSnapshot } from "./verification/cache.ts";
import { smokeDeployment } from "./validation/deployment-smoke.ts";
import { runPrecheck } from "./verification/prechecks.ts";
import { reportBuildSizes, sizeOptions } from "./validation/build-size.ts";

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
    case "verify:check":
      runPrecheck(root, args[0] ?? "");
      break;
    case "knip":
      checkKnip(root);
      break;
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
    case "browser:run": {
      const workspace = discover(root).byName.get("@raypx/e2e");
      if (!workspace) throw new Error("Missing browser test workspace");
      await run(
        "pnpm",
        ["exec", "playwright", "test", ...browserTestArguments(args, process.env)],
        join(root, workspace.path),
      );
      break;
    }
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
          await run("pnpm", ["exec", "vp", "fmt", "--write", ...paths], root);
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
    case "size":
      reportBuildSizes(root, sizeOptions(args));
      break;
    case "ci:plan": {
      const plan = readGithubPlan(root);
      console.log(JSON.stringify(plan, null, 2));
      const outputs = ciOutputs(plan, process.env.GITHUB_SHA ?? "");
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          Object.entries(outputs)
            .map(([key, value]) => `${key}=${value}\n`)
            .join(""),
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
    case "deployment:smoke":
      await smokeDeployment(root, args);
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
      console.log("Build outputs, staged native resources and test artifacts removed");
      break;
    }
    case "clean:artifacts":
      await cleanArtifacts(root);
      console.log("Validation reports and test artifacts removed");
      break;
    case "doctor": {
      assertNodeVersion(root, process.versions.node);
      console.log(`Node ${process.versions.node}; ${process.platform}/${process.arch}`);
      console.log(
        `Desktop: Tauri; Rust ${findExecutable("cargo") ? "available" : "unavailable"}; pnpm run verify selects affected JavaScript and Rust checks`,
      );
      break;
    }
    case undefined:
      console.log(
        "raypx-dev: test | tasks | e2e | workspace | policy | i18n | verify | size | smoke | deployment:smoke | env | db | desktop | clean | clean:artifacts | doctor",
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
