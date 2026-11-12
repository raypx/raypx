#!/usr/bin/env bun
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = fileURLToPath(new URL("../../../", import.meta.url));

interface Command {
  usage: string;
  summary: string;
  /** VP leaves and CI entries: callable, but omitted from help. */
  internal?: true;
  /** Arguments go to another tool, which owns `--help`. */
  passthrough?: true;
  run(this: void, args: string[]): Promise<void>;
}

function findings(items: string[], label: string) {
  if (items.length)
    throw new Error(`${label} failed:\n${items.map((item) => `  ${item}`).join("\n")}`);
  console.log(`${label} passed`);
}

function noArguments(name: string, args: string[]) {
  if (args.length) throw new Error(`Usage: raypx-dev ${name}`);
}

async function appendGithubOutput(lines: string) {
  if (!process.env.GITHUB_OUTPUT) return;
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, lines);
}

async function workspace(args: string[]) {
  const usage =
    "Usage: raypx-dev workspace list | new <name> [--kind library|app] [--target <target>] [--tests] [--write]";
  const [action, ...rest] = args;
  if (action === "list" && !rest.length) {
    const { discover } = await import("./repository.js");
    const index = discover(root);
    findings(index.findings, "Workspace discovery");
    for (const w of index.workspaces)
      console.log(`${w.path.padEnd(25)} ${w.manifest.name.padEnd(22)} ${w.metadata?.kind}`);
    return;
  }
  if (action !== "new") throw new Error(usage);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: true,
    options: {
      kind: { type: "string", default: "library" },
      target: { type: "string", default: "universal" },
      tests: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
    },
  });
  const [name] = positionals;
  if (!name || positionals.length > 1) throw new Error(usage);
  const { scaffold, scaffoldKinds, scaffoldTargets } = await import("./scaffold.js");
  const kind = scaffoldKinds.find((candidate) => candidate === values.kind);
  const target = scaffoldTargets.find((candidate) => candidate === values.target);
  if (!kind) throw new Error(`Unknown kind ${values.kind}; expected ${scaffoldKinds.join(", ")}`);
  if (!target)
    throw new Error(`Unknown target ${values.target}; expected ${scaffoldTargets.join(", ")}`);
  const paths = scaffold(root, name, { kind, target, write: values.write, tests: values.tests });
  if (values.write) {
    const { run } = await import("@raypx/runtime-node/process");
    await run(process.execPath, ["--bun", "vp", "fmt", "--write", ...paths], root);
  }
  console.log(
    `${values.write ? "Created" : "Preview (use --write to create)"}:\n${paths.join("\n")}`,
  );
}

const commands: Record<string, Command> = {
  tasks: {
    usage: "tasks <task> [VP options]",
    summary: "Run a VP task across the workspace graph",
    passthrough: true,
    async run([task, ...args]) {
      if (!task) throw new Error("Usage: raypx-dev tasks <task> [VP options]");
      const { runTasks } = await import("./repository.js");
      await runTasks(root, task, args);
    },
  },
  test: {
    usage: "test [suite] [--package name|path] [VP options] [-- runner arguments]",
    summary: "Run declared test suites; `test list` shows them",
    passthrough: true,
    async run(args) {
      const { runTests } = await import("./test-command.js");
      await runTests(root, process.cwd(), args);
    },
  },
  e2e: {
    usage: "e2e [--package web|desktop] [--web|--desktop] [--smoke] [--dry-run] [-- flags]",
    summary: "Run browser acceptance through Playwright",
    passthrough: true,
    async run(args) {
      const { runTests } = await import("./test-command.js");
      await runTests(root, process.cwd(), ["e2e", ...args]);
    },
  },
  workspace: {
    usage: "workspace list | new <name> [--kind] [--target] [--tests] [--write]",
    summary: "List workspaces or scaffold a new one",
    run: workspace,
  },
  policy: {
    usage: "policy",
    summary: "Check repository boundaries, entries and conventions",
    async run(args) {
      noArguments("policy", args);
      const { policy } = await import("./policy.js");
      findings(policy(root), "Repository policy");
    },
  },
  i18n: {
    usage: "i18n",
    summary: "Check locale catalog parity",
    async run(args) {
      noArguments("i18n", args);
      const { checkLocales } = await import("./policy.js");
      findings(checkLocales(root), "Locale catalogs");
    },
  },
  format: {
    usage: "format [--write] [files]",
    summary: "Check formatting, or apply it with --write",
    passthrough: true,
    async run(args) {
      const separator = args.indexOf("--");
      const options = separator < 0 ? args : args.slice(0, separator);
      if (options.includes("--help") || options.includes("-h"))
        console.log("bun format checks formatting by default. Pass --write to apply changes.\n");
      const hasOutputMode = options.some(
        (arg) => arg === "--check" || arg === "--write" || arg === "--list-different",
      );
      const { run } = await import("@raypx/runtime-node/process");
      await run(
        process.execPath,
        ["--bun", "vp", "fmt", ...(hasOutputMode ? args : ["--check", ...args])],
        root,
      );
    },
  },
  verify: {
    usage: "verify [--full] [--no-cache] [--base ref] [--dry-run]",
    summary: "Run affected checks and tests, or everything with --full",
    passthrough: true,
    async run(args) {
      const { verify } = await import("./verification/index.js");
      await verify(root, args);
    },
  },
  size: {
    usage: "size [--package name|path] [--native] [--browser] [--require]",
    summary: "Measure existing build outputs",
    async run(args) {
      const { reportBuildSizes, sizeOptions } = await import("./validation/build-size.js");
      reportBuildSizes(root, sizeOptions(args));
    },
  },
  smoke: {
    usage: "smoke",
    summary: "Probe built artifacts",
    async run(args) {
      noArguments("smoke", args);
      const { smoke } = await import("./smoke/index.js");
      await smoke(root);
    },
  },
  "deployment:smoke": {
    usage: "deployment:smoke [--platform linux/amd64|linux/arm64]",
    summary: "Build and probe the container images",
    async run(args) {
      const { smokeDeployment } = await import("./validation/deployment-smoke.js");
      await smokeDeployment(root, args);
    },
  },
  env: {
    usage: "env -- <command>",
    summary: "Run a command with the development environment",
    passthrough: true,
    async run(args) {
      const values = args[0] === "--" ? args.slice(1) : args;
      if (!values[0] || /^(?:rpx|raypx-dev)(?:\.exe)?$/.test(values[0]))
        throw new Error("Usage: raypx-dev env -- <external command>");
      const { run } = await import("@raypx/runtime-node/process");
      const { developmentEnvironment } = await import("./repo/environment.js");
      await run(values[0], values.slice(1), process.cwd(), developmentEnvironment(root));
    },
  },
  analytics: {
    usage: "analytics sourcemaps <web|desktop>",
    summary: "Upload client source maps for a built release",
    async run([action, surface, ...rest]) {
      if (action !== "sourcemaps" || rest.length)
        throw new Error("Usage: raypx-dev analytics sourcemaps <web|desktop>");
      const { uploadAnalyticsMaps } = await import("./analytics.js");
      await uploadAnalyticsMaps(root, surface);
    },
  },
  clean: {
    usage: "clean",
    summary: "Remove build outputs, staged native resources and test artifacts",
    async run(args) {
      noArguments("clean", args);
      const { clean } = await import("./clean.js");
      await clean(root);
      console.log("Build outputs, staged native resources and test artifacts removed");
    },
  },
  "clean:artifacts": {
    usage: "clean:artifacts",
    summary: "Remove validation reports and test artifacts",
    async run(args) {
      noArguments("clean:artifacts", args);
      const { cleanArtifacts } = await import("./clean.js");
      await cleanArtifacts(root);
      console.log("Validation reports and test artifacts removed");
    },
  },
  doctor: {
    usage: "doctor",
    summary: "Check the Bun pin and native prerequisites",
    async run(args) {
      noArguments("doctor", args);
      const { readBunPin } = await import("./validation/toolchain.js");
      const bun = readBunPin(root);
      if (Bun.version !== bun) throw new Error(`Expected Bun ${bun}, got ${Bun.version}`);
      console.log(`Bun ${Bun.version}; ${process.platform}/${process.arch}`);
      console.log(
        `Desktop: MyGo; Go ${Bun.which("go") ? "available" : "unavailable"} (required for native packaging); bun run verify selects affected JavaScript and Go checks`,
      );
    },
  },
  "verify:check": {
    usage: "verify:check <policy|locales> <platform>",
    summary: "VP leaf for cached policy and locale checks",
    internal: true,
    async run(args) {
      const { runPrecheck } = await import("./verification/prechecks.js");
      runPrecheck(root, args[0] ?? "");
    },
  },
  "browser:run": {
    usage: "browser:run",
    summary: "VP leaf that runs the shared Playwright process",
    internal: true,
    passthrough: true,
    async run(args) {
      const { runBrowserTests } = await import("./browser-run.js");
      await runBrowserTests(root, args);
    },
  },
  "ci:plan": {
    usage: "ci:plan",
    summary: "Emit the CI plan for the current event",
    internal: true,
    async run() {
      const { readGithubPlan } = await import("./verification/ci.js");
      const { ciOutputs } = await import("./verification/gates.js");
      const plan = await readGithubPlan(root);
      console.log(JSON.stringify(plan, null, 2));
      const outputs = ciOutputs(plan, process.env.GITHUB_SHA ?? "");
      await appendGithubOutput(
        Object.entries(outputs)
          .map(([key, value]) => `${key}=${value}\n`)
          .join(""),
      );
    },
  },
  "ci:gate": {
    usage: "ci:gate <gate> [phase]",
    summary: "Run one CI gate from the emitted plan",
    internal: true,
    async run(args) {
      const { ciGate } = await import("./verification/ci.js");
      await ciGate(root, args);
    },
  },
  "ci:cache": {
    usage: "ci:cache [snapshot|...]",
    summary: "Snapshot VP cache archives",
    internal: true,
    async run(args) {
      const { cacheSnapshot } = await import("./verification/cache.js");
      await cacheSnapshot(root, args[0] ?? "snapshot");
    },
  },
  "cli:experiment": {
    usage: "cli:experiment <prepared CLI directory> [--upx <executable>]",
    summary: "Compile isolated CLI size/startup candidates",
    internal: true,
    async run(args) {
      const { experimentCliSize } = await import("./validation/cli-size.js");
      const directory = await experimentCliSize(root, args);
      await appendGithubOutput(`depth0-payload=${join(directory, "depth-0")}\n`);
    },
  },
};

/** Help lists public commands only; internal entries remain callable. */
export function helpText() {
  const visible = Object.values(commands).filter((command) => !command.internal);
  const width = Math.max(...visible.map((command) => command.usage.length));
  return [
    "Usage: raypx-dev <command> [arguments]",
    "",
    ...visible.map((command) => `  ${command.usage.padEnd(width)}  ${command.summary}`),
  ].join("\n");
}

export async function main([name, ...args]: string[]) {
  if (name === undefined || name === "--help" || name === "-h" || name === "help") {
    console.log(helpText());
    return;
  }
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  if (!command) throw new Error(`Unknown command: ${name}\n\n${helpText()}`);
  if (!command.passthrough && args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    console.log(`Usage: raypx-dev ${command.usage}\n\n${command.summary}`);
    return;
  }
  await command.run(args);
}

export async function runCli(args: string[]) {
  await main(args).catch((error: unknown) => {
    const debug = process.env.RAYPX_DEBUG === "1";
    console.error(error instanceof Error ? (debug ? error.stack : error.message) : String(error));
    process.exitCode = 1;
  });
}

if (import.meta.main) await runCli(process.argv.slice(2));
