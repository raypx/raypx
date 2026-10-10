import { posix } from "node:path";
import ts from "typescript";
import type { PolicyFinding } from "./report.ts";
import type { PolicyRepository } from "./runtime.ts";
import { object, type PolicyWorkspace } from "./workspaces.ts";

function target(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  const conditions = object(value);
  if (!conditions) return undefined;
  for (const condition of ["types", "default", "import"])
    if (Object.hasOwn(conditions, condition)) return target(conditions[condition]);
  return undefined;
}

function publicPreset(
  specifier: string,
  workspace: PolicyWorkspace | undefined,
): string | undefined {
  if (
    !workspace ||
    !/^@raypx\/config\/(?:tsconfig|tsconfig-presets)\/.+\.json$/.test(specifier) ||
    specifier.split("/").some((part) => part === "." || part === "..")
  )
    return undefined;
  const exports = object(workspace.manifest.exports);
  if (!exports) return undefined;
  const subpath = `.${specifier.slice("@raypx/config".length)}`;
  // Select once: a blocked exact/most-specific export must not fall back to a wildcard.
  const key = Object.hasOwn(exports, subpath)
    ? subpath
    : Object.keys(exports)
        .filter((candidate) => {
          const [prefix, suffix, extra] = candidate.split("*");
          return (
            suffix !== undefined &&
            extra === undefined &&
            subpath.length >= (prefix ?? "").length + suffix.length &&
            subpath.startsWith(prefix ?? "") &&
            subpath.endsWith(suffix)
          );
        })
        .sort((a, b) => b.indexOf("*") - a.indexOf("*") || b.length - a.length)[0];
  if (key === undefined) return undefined;
  const exported = target(exports[key]);
  if (!exported?.startsWith("./")) return undefined;
  const [prefix, suffix] = key.split("*");
  const replacement =
    suffix === undefined
      ? ""
      : subpath.slice((prefix ?? "").length, subpath.length - suffix.length);
  const path = posix.normalize(posix.join(workspace.directory, exported.replace("*", replacement)));
  return path.startsWith(workspace.directory + "/") ? path : undefined;
}

function isPresetDefinition(path: string, workspace: PolicyWorkspace | undefined): boolean {
  if (!workspace) return false;
  for (const [key, value] of Object.entries(object(workspace.manifest.exports) ?? {})) {
    if (!/^\.\/(?:tsconfig|tsconfig-presets)\//.test(key)) continue;
    const exported = target(value);
    if (!exported?.startsWith("./")) continue;
    const pattern = posix.normalize(posix.join(workspace.directory, exported));
    if (!pattern.startsWith(workspace.directory + "/")) continue;
    const [prefix, suffix, extra] = pattern.split("*");
    if (extra !== undefined) continue;
    const matches =
      suffix === undefined
        ? pattern === path
        : path.length >= (prefix ?? "").length + suffix.length &&
          path.startsWith(prefix ?? "") &&
          path.endsWith(suffix);
    if (!matches) continue;
    const replacement =
      suffix === undefined ? "" : path.slice((prefix ?? "").length, path.length - suffix.length);
    if (publicPreset(`@raypx/config${key.slice(1).replace("*", replacement)}`, workspace) === path)
      return true;
  }
  return false;
}

/** Resolve JSONC and public preset exports without changing deliberate compiler overrides. */
export async function checkTypeScript(
  repository: PolicyRepository,
  workspaces: PolicyWorkspace[],
  findings: PolicyFinding[],
): Promise<void> {
  const config = workspaces.find((workspace) => workspace.manifest.name === "@raypx/config");
  async function walk(
    path: string,
    chain: string[],
    preset = false,
  ): Promise<{ valid: boolean; preset: boolean }> {
    const add = (rule: string, message: string, fix: string) =>
      findings.push({ rule, path, message, fix });
    if (chain.includes(path)) {
      add(
        "tsconfig.cycle",
        `Circular extends chain: ${[...chain, path].join(" -> ")}.`,
        "Remove the circular extends edge.",
      );
      return { valid: false, preset };
    }
    const content = await repository.read(path);
    if (content === undefined) {
      add(
        "tsconfig.missing",
        "TypeScript configuration does not exist in first-party repository content.",
        "Create the configuration or repair the extends/export target.",
      );
      return { valid: false, preset };
    }
    const parsed = ts.parseConfigFileTextToJson(path, content);
    const value: unknown = parsed.config;
    const json = object(value);
    if (parsed.error || !json) {
      add(
        "tsconfig.json",
        "TypeScript configuration must contain a valid JSONC object.",
        "Repair the JSONC syntax; comments and trailing commas are supported.",
      );
      return { valid: false, preset };
    }
    if (json.extends === undefined) return { valid: true, preset };
    const bases = Array.isArray(json.extends) ? json.extends : [json.extends];
    if (!bases.length || bases.some((base) => typeof base !== "string" || !base)) {
      add(
        "tsconfig.extends",
        "extends must be a nonempty string or array of strings.",
        "Use relative configuration paths or the public @raypx/config presets.",
      );
      return { valid: false, preset };
    }
    let valid = true;
    let inheritedPreset = preset;
    for (const base of bases) {
      if (typeof base !== "string") continue;
      let resolved: string | undefined;
      let publicBase = false;
      if (base.startsWith("./") || base.startsWith("../")) {
        resolved = posix.normalize(posix.join(posix.dirname(path), base));
        if (!resolved.endsWith(".json")) resolved += ".json";
        if (resolved.startsWith("../")) resolved = undefined;
      } else {
        resolved = publicPreset(base, config);
        publicBase = resolved !== undefined;
      }
      if (!resolved) {
        add(
          "tsconfig.extends",
          `Cannot resolve extends ${base} through local configurations or public preset exports.`,
          "Use a repository-relative path or an exported @raypx/config/tsconfig/*.json preset.",
        );
        valid = false;
        continue;
      }
      const result = await walk(resolved, [...chain, path], publicBase);
      valid &&= result.valid;
      inheritedPreset ||= result.preset;
    }
    return { valid, preset: inheritedPreset };
  }
  const scopes = [...workspaces.map((workspace) => workspace.directory), "scripts"];
  for (const path of [...repository.files].sort()) {
    if (
      !/^tsconfig[^/]*\.json$/.test(posix.basename(path)) ||
      !scopes.some((scope) => path.startsWith(scope + "/"))
    )
      continue;
    const result = await walk(path, [], isPresetDefinition(path, config));
    if (result.valid && !result.preset)
      findings.push({
        rule: "tsconfig.preset",
        path,
        message: "Configuration does not inherit a public Raypx TypeScript preset.",
        fix: "Extend an @raypx/config/tsconfig/*.json preset directly or through a local configuration chain.",
      });
  }
}
