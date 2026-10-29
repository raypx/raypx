import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { taskModel, taskRef, type TaskModel } from "../tasks/model.js";
import { distributionRequested } from "./events.js";
import { browserReach } from "./platform.js";

export type Artifact = "api" | "web" | "cli";
export interface VerificationPlan {
  full: boolean;
  reasons: string[];
  files: string[];
  workspaces: string[];
  tasks: string[];
  artifacts: Artifact[];
  native: boolean;
  backend: boolean;
  browser: "none" | "web" | "desktop" | "all";
}
const git = (root: string, args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** NUL-delimited paths include both sides of renames without shell parsing. */
export function changedFiles(
  root: string,
  base = "origin/canary",
  ci?: { before?: string; head?: string },
) {
  try {
    const from = ci?.before ?? git(root, ["merge-base", base, "HEAD"]).trim();
    if (!from || /^0+$/.test(from)) throw new Error("Missing base");
    const values = [
      git(root, ["diff", "--name-only", "-z", "--no-renames", from, ci?.head ?? "HEAD"]),
    ];
    if (!ci)
      values.push(
        git(root, ["diff", "--name-only", "-z", "--no-renames", "HEAD"]),
        git(root, ["ls-files", "--others", "--exclude-standard", "-z"]),
      );
    return {
      files: [...new Set(values.flatMap((value) => value.split("\0").filter(Boolean)))].sort(),
      reasons: [] as string[],
    };
  } catch {
    return {
      files: [] as string[],
      reasons: ["Git base or changed paths unavailable; running full verification"],
    };
  }
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

export function verificationPlan(
  model: TaskModel,
  files: string[],
  options: { full?: boolean; artifacts?: boolean; reasons?: string[] } = {},
): VerificationPlan {
  const reasons = [...(options.reasons ?? [])];
  let full = Boolean(options.full || reasons.length);
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
      full = true;
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
      full = true;
      reasons.push(`Unclassified input: ${file}`);
    } else {
      full = true;
      reasons.push(`Shared formatter/linter input: ${file}`);
    }
  }
  if (full) for (const member of model.members) mark(member.name, "all");
  for (let changed = true; changed;) {
    changed = false;
    for (const member of model.members)
      for (const name of member.dependencies) {
        const scope = affected.get(name);
        if (scope === "all") changed = mark(member.name, "all") || changed;
        else if (scope === "browser" && platforms().consumes(member.name))
          changed =
            mark(member.name, platforms().leaks(member.name) ? "all" : "browser") || changed;
      }
  }
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
        ...(member.native ? ["mygo:check", "mygo:test"] : []),
        ...(includeArtifacts ? ["build"] : []),
      ]
        .filter((name) => member.scripts[name])
        .map((name) => taskRef(member.name, name)),
    );
  const web = affected.has("web"),
    desktop = affected.has("desktop"),
    browserAll = affected.has("@raypx/e2e");
  return {
    full,
    reasons: [...new Set(reasons)],
    files,
    workspaces,
    tasks,
    artifacts,
    // Native checks cover the Go host, bridge generation and CLI, never the browser renderer.
    native: full || affected.get("desktop") === "all" || affected.has("cli"),
    backend: full || affected.has("api"),
    browser:
      full || browserAll || (web && desktop) ? "all" : web ? "web" : desktop ? "desktop" : "none",
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
    : { files: [], reasons: full ? [] : ["Event base unavailable; running full verification"] };
  return {
    ...verificationPlan(taskModel(root), changed.files, {
      full,
      artifacts: true,
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
