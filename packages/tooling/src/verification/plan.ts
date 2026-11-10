import { changedFiles as readChanges, affectedWorkspaces } from "@raypx-kit/devkit/verification";
import { taskModel, taskRef, type TaskModel } from "../tasks/model.js";
import { browserReach } from "./platform.js";
import { toolingImpact } from "./tooling.js";

type Artifact = "api" | "web" | "cli";
export interface VerificationPlan {
  full: boolean;
  reasons: string[];
  files: string[];
  workspaces: string[];
  tasks: string[];
  artifacts: Artifact[];
  /** Current-platform Go checks; Linux-only changes need no macOS/Windows runner. */
  native: boolean;
  nativeRunners: string[];
  backend: boolean;
  containerSmoke: boolean;
  browser: "none" | "web" | "desktop" | "all";
}
export function changedFiles(
  root: string,
  base = "origin/canary",
  ci?: { before?: string; head?: string },
) {
  const changed = readChanges(root, base, ci);
  return {
    ...changed,
    reasons: changed.reasons.map((reason) =>
      reason.replace("full verification", "all source and native checks"),
    ),
  };
}
function documentation(file: string) {
  return (
    file.startsWith("docs/") || /(?:^|\/)(?:README|AGENTS|CHANGELOG|LICENSE)(?:\.md)?$/.test(file)
  );
}
function globalInput(file: string) {
  return /^(?:package\.json|bun\.lock|bunfig\.toml|mise\.toml|(?:tsconfig|test\.config|vite\.config)[^/]*|\.github\/)/.test(
    file,
  );
}

/** Railway builds ordinary source changes; CI images exercise changes to the container path. */
function containerSmokeInput(file: string) {
  if (documentation(file)) return false;
  if (file === "apps/api/tests/fixtures/deployment.ts") return true;
  if (/\/tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return false;
  if (/(?:^|\/)Dockerfile(?:\.[^/]*)?$/.test(file)) return true;
  return (
    file.startsWith("deploy/") ||
    [
      ".dockerignore",
      ".github/workflows/container-smoke.yml",
      "infra/railway/railway.ts",
      "infra/railway/Caddyfile",
      "packages/tooling/src/build/deployment.ts",
      "packages/tooling/src/validation/deployment-smoke.ts",
      "packages/tooling/src/validation/evidence.ts",
      "packages/tooling/src/smoke/checks.ts",
    ].includes(file)
  );
}

/** Select native work from its actual inputs, independently of JavaScript dependency reach. */
function nativeChanges(model: TaskModel, files: string[], full: boolean, macos: boolean) {
  const runners = ["macos-latest", "windows-latest"];
  const defaults = macos ? runners : ["windows-latest"];
  const paths = files.filter((file) => {
    if (documentation(file)) return false;
    if (
      file === ".gitattributes" ||
      file === ".github/workflows/native.yml" ||
      file.startsWith(".github/actions/native-checks/")
    )
      return true;
    const member = model.members.find((candidate) => file.startsWith(candidate.path + "/"));
    if (!member) return false;
    const relative = file.slice(member.path.length + 1);
    if (member.name === "@raypx/tooling")
      return (
        /^src\/build\/(?:cli|archive)(?:\.test)?\.ts$/.test(relative) ||
        /^src\/tasks\/(?:leaf|arguments|delegation)\.ts$/.test(relative) ||
        /^src\/verification\/(?:plan|ci|native-workflow)(?:\.test)?\.ts$/.test(relative) ||
        /^src\/validation\/build-size(?:\.test)?\.ts$/.test(relative) ||
        relative === "tests/integration/task-leaf.test.ts"
      );
    if (member.name === "@raypx/runtime-node")
      return relative.startsWith("src/") || relative === "scripts/task.ts";
    if (member.name === "@raypx/tsconfig") return relative === "scripts/task.ts";
    if (member.native)
      return /^(?:[^/]+\.go$|go\.(?:mod|sum)$|(?:bridge|preferences|mygo\.config)\.ts$|package\.json$|internal\/|resources\/|scripts\/host\/|tests\/native\/)/.test(
        relative,
      );
    if (member.name === "cli")
      return /^(?:package\.json$|scripts\/(?:prepare-herdr|build|distribution|archive-smoke)\.ts$|src\/main\.ts$|src\/runtime\/(?:(?:host|index)\.ts$|(?:terminal|daemon|process)\/)|tests\/(?:integration|unit)\/runtime\/(?:terminal|daemon|process|herdr)(?:\/|\.)|tests\/(?:helpers\/(?:herdr|terminal|instance|provider-proxy|temporary|remote-)|fixtures\/(?:terminal|process)\/|smoke\/(?:artifact|daemon-agents|herdr-terminal|windows-payload|terminal-)))/.test(
        relative,
      );
    return (
      member.name === "@raypx/contracts" &&
      /^src\/(?:local(?:-client)?|terminal)(?:\/|\.)/.test(relative)
    );
  });
  const selected = new Set<string>();
  for (const file of paths) {
    if (/(?:^|[/_.-])(?:windows|win32)(?:[/_.-]|$)/i.test(file)) selected.add("windows-latest");
    else if (/(?:^|[/_.-])(?:darwin|macos|unix)(?:[/_.-]|$)/i.test(file))
      selected.add("macos-latest");
    else if (!/(?:^|[/_.-])linux(?:[/_.-]|$)/i.test(file))
      for (const runner of defaults) selected.add(runner);
  }
  return {
    native: full || paths.length > 0,
    nativeRunners: full ? defaults : runners.filter((runner) => selected.has(runner)),
  };
}

export function verificationPlan(
  model: TaskModel,
  files: string[],
  options: { full?: boolean; reasons?: string[]; macos?: boolean } = {},
): VerificationPlan {
  const reasons = [...(options.reasons ?? [])];
  const full = Boolean(options.full);
  let allSources = full || reasons.length > 0;
  const native = nativeChanges(model, files, full || reasons.length > 0, options.macos ?? true);
  // "browser" workspaces are reached only through browser code; "all" may affect any platform.
  const affected = new Map<string, "browser" | "all">();
  const mark = (name: string, scope: "browser" | "all") => {
    const current = affected.get(name);
    if (current === "all" || current === scope) return false;
    affected.set(name, scope);
    return true;
  };
  let reach: ReturnType<typeof browserReach> | undefined;
  let tooling: ReturnType<typeof toolingImpact> | undefined;
  const isolated = new Set<string>();
  const platforms = () => (reach ??= browserReach(model.root));
  for (const file of files) {
    if (documentation(file)) continue;
    if (
      (file.startsWith(".github/workflows/") ||
        file.startsWith(".github/actions/native-checks/")) &&
      model.members.some((member) => member.name === "@raypx/tooling")
    ) {
      isolated.add("@raypx/tooling");
      continue;
    }
    if (file.startsWith("packages/tooling/")) {
      const impact = (tooling ??= toolingImpact(model.root))(file);
      if (impact.global) {
        allSources = true;
        reasons.push(`Shared verification input: ${file}`);
      } else {
        isolated.add("@raypx/tooling");
        for (const consumer of impact.consumers) mark(consumer, "all");
      }
      continue;
    }
    if (globalInput(file)) {
      allSources = true;
      reasons.push(`Shared verification input: ${file}`);
      continue;
    }
    const owner = model.members
      .filter((member) => file.startsWith(member.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    // Go host inputs are verified by Go; they do not import renderer TypeScript.
    if (owner?.native && native.native && /(?:\.go$|\/go\.(?:mod|sum)$)/.test(file)) continue;
    if (owner)
      mark(
        owner.name,
        platforms().browserOnly(file) && !platforms().leaks(owner.name) ? "browser" : "all",
      );
    else if (!/^(?:\.gitignore|\.oxfmtrc[^/]*|\.oxlintrc[^/]*)$/.test(file)) {
      allSources = true;
      reasons.push(`Unclassified input: ${file}`);
    } else {
      allSources = true;
      reasons.push(`Shared formatter/linter input: ${file}`);
    }
  }
  if (allSources) for (const member of model.members) mark(member.name, "all");
  const reached = affectedWorkspaces(model.members, affected, {
    merge: (before, next) =>
      before === "all" || next === "all" ? ("all" as const) : ("browser" as const),
    propagate: (scope, _, consumer) =>
      scope === "all"
        ? ("all" as const)
        : platforms().consumes(consumer.name)
          ? platforms().leaks(consumer.name)
            ? ("all" as const)
            : ("browser" as const)
          : undefined,
  });
  affected.clear();
  for (const [name, scope] of reached) affected.set(name, scope);
  for (const name of isolated) affected.set(name, "all");
  const nativeMembers = model.members.filter((member) => member.native && native.native);
  const workspaces = [
    ...new Set([...affected.keys(), ...nativeMembers.map((member) => member.name)]),
  ].sort();
  const artifacts = full
    ? (["api", "web", "cli"] as const).filter(
        (name) =>
          affected.has(name) &&
          model.members.some((member) => member.name === name && member.scripts.build),
      )
    : [];
  const tasks = model.members
    .filter((member) => affected.has(member.name) || nativeMembers.includes(member))
    .flatMap((member) =>
      [
        ...(affected.has(member.name) ? ["check", "test"] : []),
        ...(member.native && native.native ? ["mygo:check", "mygo:test"] : []),
        ...(full ? ["build"] : []),
      ]
        .filter((name) => member.scripts[name])
        .map((name) => taskRef(member.name, name)),
    );
  const browserTests = model.members.find((member) => member.name === "@raypx/e2e");
  return {
    full,
    reasons: [...new Set(reasons)],
    files,
    workspaces,
    tasks,
    artifacts,
    ...native,
    backend: full || (!allSources && affected.has("api")),
    containerSmoke: full || files.some(containerSmokeInput),
    browser:
      full ||
      (browserTests &&
        files.some((file) => file.startsWith(browserTests.path + "/") && !documentation(file)))
        ? "all"
        : "none",
  };
}

export function localPlan(root: string, options: { full?: boolean; base?: string } = {}) {
  const changed = changedFiles(root, options.base);
  return verificationPlan(taskModel(root), changed.files, { ...options, reasons: changed.reasons });
}
