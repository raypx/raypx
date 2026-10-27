import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { planBrowserTests } from "./browser-tests.js";
import { discover, runTasks } from "./repository.js";

interface TestWorkspace {
  name: string;
  path: string;
  scripts: Record<string, string>;
}
const suites = [
  "all",
  "unit",
  "component",
  "integration",
  "coverage",
  "postgres",
  "redis",
  "e2e",
  "inventory",
  "backends",
];
/** Package scripts accept runner flags directly; only explicit graph controls stay outside --. */
export function packageTestArguments(argv: string[]): string[] {
  const [suite, ...args] = argv;
  if (!suite) throw new Error("A package test suite is required");
  const split = args.indexOf("--");
  const before = split < 0 ? args : args.slice(0, split);
  const controls = new Set(["--dry-run", "--no-cache"]);
  const graph = before.filter((arg) => controls.has(arg));
  const runner = [
    ...before.filter((arg) => !controls.has(arg)),
    ...(split < 0 ? [] : args.slice(split + 1)),
  ];
  return [suite, ...graph, ...(runner.length ? ["--", ...runner] : [])];
}
type TestPlan =
  | { kind: "help"; members: TestWorkspace[] }
  | { kind: "list"; members: TestWorkspace[] }
  | { kind: "inventory"; args: string[] }
  | { kind: "backends"; args: string[] }
  | { kind: "tasks"; task: string; args: string[]; env: Record<string, string> };

export function planTests(
  root: string,
  cwd: string,
  members: TestWorkspace[],
  argv: string[],
): TestPlan {
  const split = argv.indexOf("--");
  const before = split < 0 ? [...argv] : argv.slice(0, split);
  const forwarded = split < 0 ? [] : argv.slice(split);
  let suite = "all";
  if (before[0] && !before[0].startsWith("-")) suite = before.shift()!;
  let selected: string | undefined;
  const args: string[] = [];
  for (let index = 0; index < before.length; index++) {
    const value = before[index]!;
    if (value === "--package" || value === "-p") {
      const next = before[++index];
      if (!next || next.startsWith("-"))
        throw new Error("--package requires a workspace name or path");
      selected = next;
    } else if (value.startsWith("--package=")) selected = value.slice(10);
    else args.push(value);
  }
  const exact =
    selected === undefined
      ? []
      : members.filter(
          (member) =>
            member.name === selected || resolve(root, member.path) === resolve(cwd, selected),
        );
  const match =
    selected === undefined
      ? []
      : exact.length
        ? exact
        : members.filter((member) => basename(member.path) === selected);
  if (selected !== undefined && match.length !== 1)
    throw new Error(
      match.length
        ? `Ambiguous workspace: ${selected}; use its full name or path`
        : `Unknown workspace: ${selected}`,
    );
  const local = members.find((member) => {
    const path = relative(resolve(root, member.path), resolve(cwd));
    return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
  });
  const owner = match[0] ?? local;
  if (suite === "list" || args.includes("--help") || args.includes("-h"))
    return {
      kind: suite === "list" ? ("list" as const) : ("help" as const),
      members: selected ? match : members,
    };
  if (!suites.includes(suite))
    throw new Error(`Unknown test suite: ${suite}; use test --help (filenames go after --)`);
  if (suite === "inventory" || suite === "backends") {
    if (selected && !owner?.scripts[`test:${suite}`])
      throw new Error(`Workspace does not own test:${suite}`);
    return { kind: suite, args: [...args, ...forwarded] };
  }
  if (suite === "e2e") {
    if (owner && !owner.scripts.e2e)
      throw new Error("Select the E2E workspace, or use --web/--desktop for a browser surface");
    const browser = planBrowserTests([...args, ...forwarded]);
    return {
      kind: "tasks" as const,
      task: owner ? `${owner.name}#${browser.task}` : browser.task,
      args: browser.args,
      env: browser.env,
    };
  }
  const task = suite === "all" ? "test" : `test:${suite}`;
  if (owner && !owner.scripts[task]) throw new Error(`${owner.name} has no ${task}; use test list`);
  return {
    kind: "tasks" as const,
    task: owner ? `${owner.name}#${task}` : task,
    args: [...args, ...forwarded],
    env: {},
  };
}

export async function runTests(root: string, cwd: string, args: string[]) {
  const members = discover(root).workspaces.map((workspace) => ({
    name: workspace.manifest.name,
    path: workspace.path,
    scripts: workspace.manifest.scripts ?? {},
  }));
  const plan = planTests(root, cwd, members, args);
  if (plan.kind === "help" || plan.kind === "list") {
    if (plan.kind === "help")
      console.log(
        [
          "bun run test [all|unit|component|integration|coverage|postgres|redis] [--package name|path] [VP flags] [-- test flags]",
          "bun run test e2e [--web|--desktop] [--smoke] [--visual] [-- Playwright flags]",
          "bun run test inventory [--layers] [--baseline file] [--owners file]",
          "bun run test backends [--with-e2e [-- Playwright flags]]",
          "bun run test list",
          "Package: bun run --cwd packages/tasks test (or test:unit / test:component)",
        ].join("\n"),
      );
    for (const member of plan.members) {
      const commands = Object.keys(member.scripts).filter(
        (name) =>
          name === "test" || name.startsWith("test:") || name === "e2e" || name.startsWith("e2e:"),
      );
      if (commands.length)
        console.log(`${member.name.padEnd(23)} ${member.path.padEnd(20)} ${commands.join(", ")}`);
    }
  } else if (plan.kind === "inventory") {
    const { auditTests } = await import("./validation/tests.js");
    await auditTests(root, plan.args, cwd);
  } else if (plan.kind === "backends") {
    const { validateBackends } = await import("./validation/backends.js");
    await validateBackends(root, plan.args);
  } else await runTasks(root, plan.task, plan.args, plan.env);
}
