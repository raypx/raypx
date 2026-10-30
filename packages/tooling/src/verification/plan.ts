import { changedFiles as readChanges, affectedWorkspaces } from "@raypx-kit/devkit/verification";
import { readFileSync } from "node:fs";
import { taskModel, taskRef, type TaskModel } from "../tasks/model.js";
import { distributionRequested } from "./events.js";
import { browserReach } from "./platform.js";

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
  return /^(?:package\.json|bun\.lock|bunfig\.toml|mise\.toml|(?:tsconfig|test\.config|vite\.config)[^/]*|\.github\/|packages\/tooling\/)/.test(
    file,
  );
}

/** Select native work from its actual inputs, independently of JavaScript dependency reach. */
function nativeChanges(model: TaskModel, files: string[], full: boolean) {
  const runners = ["macos-latest", "windows-latest"];
  const paths = files.filter((file) => {
    if (documentation(file)) return false;
    if (file === ".github/workflows/native.yml") return true;
    const member = model.members.find((candidate) => file.startsWith(candidate.path + "/"));
    if (!member) return false;
    const relative = file.slice(member.path.length + 1);
    if (member.native)
      return /^(?:[^/]+\.go$|go\.(?:mod|sum)$|(?:bridge|preferences|mygo\.config)\.ts$|package\.json$|internal\/|resources\/|scripts\/native\/|tests\/native\/)/.test(
        relative,
      );
    if (member.name === "cli")
      return /^(?:package\.json$|scripts\/prepare-herdr\.ts$|src\/runtime\/(?:terminal|daemon|process)\/|tests\/(?:integration|unit)\/runtime\/(?:terminal|daemon|process|herdr)(?:\/|\.)|tests\/(?:helpers\/(?:herdr|terminal)|fixtures\/(?:terminal|process)\/|smoke\/(?:herdr-terminal|terminal-)))/.test(
        relative,
      );
    return member.name === "@raypx/contracts" && /^src\/(?:local|terminal)(?:\/|\.)/.test(relative);
  });
  const selected = new Set<string>();
  for (const file of paths) {
    if (/(?:^|[/_.-])(?:windows|win32)(?:[/_.-]|$)/i.test(file)) selected.add("windows-latest");
    else if (/(?:^|[/_.-])(?:darwin|macos|unix)(?:[/_.-]|$)/i.test(file))
      selected.add("macos-latest");
    else if (!/(?:^|[/_.-])linux(?:[/_.-]|$)/i.test(file))
      for (const runner of runners) selected.add(runner);
  }
  return {
    native: full || paths.length > 0,
    nativeRunners: full ? runners : runners.filter((runner) => selected.has(runner)),
  };
}

export function verificationPlan(
  model: TaskModel,
  files: string[],
  options: { full?: boolean; artifacts?: boolean; reasons?: string[] } = {},
): VerificationPlan {
  const reasons = [...(options.reasons ?? [])];
  const full = Boolean(options.full);
  let allSources = full || reasons.length > 0;
  const native = nativeChanges(model, files, full || reasons.length > 0);
  // "browser" workspaces are reached only through browser code; "all" may affect any platform.
  const affected = new Map<string, "browser" | "all">();
  const mark = (name: string, scope: "browser" | "all") => {
    const current = affected.get(name);
    if (current === "all" || current === scope) return false;
    affected.set(name, scope);
    return true;
  };
  let reach: ReturnType<typeof browserReach> | undefined;
  const platforms = () => (reach ??= browserReach(model.root));
  for (const file of files) {
    if (documentation(file)) continue;
    if (globalInput(file)) {
      allSources = true;
      reasons.push(`Shared verification input: ${file}`);
      continue;
    }
    const owner = model.members
      .filter((member) => file.startsWith(member.path + "/"))
      .sort((a, b) => b.path.length - a.path.length)[0];
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
  if (native.native)
    for (const member of model.members.filter((candidate) => candidate.native))
      mark(member.name, "all");
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
  const workspaces = [...affected.keys()].sort();
  const includeArtifacts = options.artifacts ?? full;
  const artifacts = includeArtifacts
    ? (["api", "web", "cli"] as const).filter(
        (name) =>
          affected.has(name) &&
          model.members.some((member) => member.name === name && member.scripts.build),
      )
    : [];
  const tasks = model.members
    .filter((member) => affected.has(member.name))
    .flatMap((member) =>
      [
        "check",
        "test",
        ...(member.native && native.native ? ["mygo:check", "mygo:test"] : []),
        ...(includeArtifacts ? ["build"] : []),
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
    browser:
      full ||
      (browserTests &&
        files.some((file) => file.startsWith(browserTests.path + "/") && !documentation(file)))
        ? "all"
        : "none",
  };
}

export function localPlan(
  root: string,
  options: { full?: boolean; base?: string; artifacts?: boolean } = {},
) {
  const changed = changedFiles(root, options.base);
  return verificationPlan(taskModel(root), changed.files, { ...options, reasons: changed.reasons });
}
export function githubPlan(root: string, eventName: string, event: Record<string, unknown>) {
  const pull = event.pull_request as { base: { sha: string } } | undefined;
  const ref = typeof event.ref === "string" ? event.ref : "";
  const full = eventName === "workflow_dispatch" || ref.startsWith("refs/tags/");
  const before =
    eventName === "pull_request"
      ? pull?.base.sha
      : typeof event.before === "string"
        ? event.before
        : undefined;
  const changed = before
    ? changedFiles(root, "HEAD", { before, head: "HEAD" })
    : {
        files: [],
        reasons: full ? [] : ["Event base unavailable; checking all sources and native targets"],
      };
  return {
    ...verificationPlan(taskModel(root), changed.files, {
      full,
      artifacts: full,
      reasons: changed.reasons,
    }),
    distribution: distributionRequested(
      eventName,
      ref,
      (event.inputs as Record<string, unknown> | undefined)?.distribution,
    ),
  };
}
export function readGithubPlan(root: string) {
  const file = process.env.GITHUB_EVENT_PATH;
  const event = file ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  return githubPlan(root, process.env.GITHUB_EVENT_NAME ?? "workflow_dispatch", event);
}
