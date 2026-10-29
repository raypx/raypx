import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { taskModel, taskRef, type TaskModel } from "../tasks/model.js";
import { cargoChanges } from "./rust.js";
import { distributionRequested } from "./events.js";

export type Artifact = "api" | "web" | "cli";
export interface VerificationPlan {
  full: boolean;
  reasons: string[];
  files: string[];
  workspaces: string[];
  tasks: string[];
  artifacts: Artifact[];
  rust: boolean;
  rustPackages: string[];
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
  return /^(?:package\.json|bun\.lock|bunfig\.toml|mise\.toml|rust-toolchain\.toml|Cargo\.(?:toml|lock)|(?:tsconfig|test\.config|vite\.config)[^/]*|\.github\/|packages\/tooling\/)/.test(
    file,
  );
}

export function verificationPlan(
  model: TaskModel,
  files: string[],
  options: { full?: boolean; artifacts?: boolean; reasons?: string[]; rust?: boolean } = {},
): VerificationPlan {
  const reasons = [...(options.reasons ?? [])];
  let full = Boolean(options.full || reasons.length);
  let rustPackages: string[] = [],
    nativeRust = false;
  const rustFiles = files.some(
    (file) =>
      file.startsWith("crates/") ||
      file.startsWith("apps/desktop/src-tauri/") ||
      file.endsWith(".rs"),
  );
  if (
    !full &&
    !files.some(globalInput) &&
    options.rust !== false &&
    rustFiles &&
    existsSync(join(model.root, "Cargo.toml"))
  ) {
    try {
      const scope = cargoChanges(model.root, files);
      rustPackages = scope.packages;
      nativeRust = scope.native;
    } catch {
      full = true;
      reasons.push("Cargo dependency graph unavailable; running full verification");
    }
  }
  const affected = new Set<string>();
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
    if (owner) affected.add(owner.name);
    else if (
      !file.startsWith("crates/") &&
      !/^(?:\.gitignore|\.oxfmtrc[^/]*|\.oxlintrc[^/]*)$/.test(file)
    ) {
      full = true;
      reasons.push(`Unclassified input: ${file}`);
    } else if (!file.startsWith("crates/")) {
      full = true;
      reasons.push(`Shared formatter/linter input: ${file}`);
    }
  }
  if (full) for (const member of model.members) affected.add(member.name);
  for (;;) {
    const count = affected.size;
    for (const member of model.members)
      if (member.dependencies.some((name) => affected.has(name))) affected.add(member.name);
    if (count === affected.size) break;
  }
  const rust =
    options.rust !== false &&
    existsSync(join(model.root, "Cargo.toml")) &&
    (full ||
      files.some(
        (file) =>
          file.startsWith("crates/") ||
          file.startsWith("apps/desktop/src-tauri/") ||
          file.endsWith(".rs"),
      ));
  const workspaces = [...affected].sort();
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
      ["check", "test", ...(includeArtifacts ? ["build"] : [])]
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
    rust,
    rustPackages,
    native: full || desktop || affected.has("cli") || nativeRust,
    backend: full || affected.has("api"),
    browser:
      full || browserAll || (web && desktop) ? "all" : web ? "web" : desktop ? "desktop" : "none",
  };
}

export function localPlan(
  root: string,
  options: { full?: boolean; base?: string; artifacts?: boolean; rust?: boolean } = {},
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
