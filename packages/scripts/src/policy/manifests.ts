import { parseJson, isObject, serializeJson } from "./json.js";
import type { PolicyFinding } from "./checks.js";
import {
  canonicalScripts,
  engineFinding,
  scriptFinding,
  structureFinding,
  validateDependencies,
  validateScripts,
} from "./manifests/rules.js";

export { canonicalScripts } from "./manifests/rules.js";

/** Facts observed from workspace files, not an exemption list. */
export interface WorkspaceShape {
  /** True when the workspace root holds a `vitest.config.ts`. */
  hasVitestConfig: boolean;
  /** True when any `*.{test,spec}.{ts,tsx}` file exists anywhere in it. */
  hasTestFiles: boolean;
  /** Workspace-relative `tsconfig*.json` files in the workspace root, sorted. */
  typeScriptConfigs: readonly string[];
}

const testFile = /\.(?:test|spec)\.tsx?$/;
const typeScriptConfig = /^tsconfig(?:\..+)?\.json$/;

/** Derive root configs and nested test presence from repository-relative files. */
export function deriveWorkspaceShape(member: string, files: readonly string[]): WorkspaceShape {
  const prefix = `${member}/`;
  const owned = files
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length));
  // A config nested under src/ belongs to a fixture or a test, not to the
  // workspace, so only the root listing counts.
  const root = owned.filter((file) => !file.includes("/"));

  return {
    hasVitestConfig: root.includes("vitest.config.ts"),
    hasTestFiles: owned.some((file) => testFile.test(file)),
    typeScriptConfigs: root.filter((file) => typeScriptConfig.test(file)).sort(),
  };
}

interface Manifest {
  dependencies?: unknown;
  devDependencies?: unknown;
  devEngines?: unknown;
  peerDependencies?: unknown;
  scripts?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStringMap(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

/** Validate scripts, dependency protocols and root toolchain inheritance. Peers retain version ranges. */
export function validateWorkspaceManifest(
  location: string,
  content: string,
  shape: WorkspaceShape,
): PolicyFinding[] {
  const result = parseJson(content);
  if (!result.valid) {
    return [
      scriptFinding(
        location,
        "is not valid JSON",
        `repair ${location}; package.json must be strict JSON, without comments`,
      ),
    ];
  }
  const parsed = result.value;

  if (!isPlainObject(parsed)) return [structureFinding(location, "package.json")];
  const manifest = parsed as Manifest;
  const findings: PolicyFinding[] = [];

  if (manifest.scripts === undefined) {
    findings.push(...validateScripts(location, {}, shape));
  } else if (isStringMap(manifest.scripts)) {
    findings.push(...validateScripts(location, manifest.scripts, shape));
  } else {
    findings.push(structureFinding(location, "scripts"));
  }

  for (const [field, value] of [
    ["dependencies", manifest.dependencies],
    ["devDependencies", manifest.devDependencies],
  ] as const) {
    if (value === undefined) continue;
    if (!isStringMap(value)) {
      findings.push(structureFinding(location, field));
      continue;
    }
    findings.push(...validateDependencies(location, field, value));
  }

  if (manifest.devEngines !== undefined) {
    findings.push(
      engineFinding(
        location,
        "declares its own devEngines",
        `remove the devEngines block from ${location}; the root package.json pins Bun and Node for every workspace`,
      ),
    );
  }

  return findings;
}

/** Fix canonical scripts, repeated checks and repeated devEngines. Preserve bytes on a no-op. */
export function fixWorkspaceManifest(content: string, shape: WorkspaceShape): string {
  const result = parseJson(content);
  if (!result.valid) {
    return content;
  }
  const parsed = result.value;
  if (!isPlainObject(parsed)) return content;
  const manifest = parsed as Manifest;

  // Tracked rather than inferred by comparing serializations: a conforming
  // manifest that merely indents differently has no finding against it, and
  // reformatting it would be this command doing Oxfmt's job uninvited.
  let changed = false;
  let scripts: Record<string, string> | undefined;
  if (manifest.scripts === undefined && shape.hasVitestConfig) {
    scripts = {};
    manifest.scripts = scripts;
    changed = true;
  } else if (isStringMap(manifest.scripts)) {
    scripts = manifest.scripts;
  }

  if (scripts !== undefined && shape.hasVitestConfig) {
    for (const [name, canonical] of Object.entries(canonicalScripts)) {
      if (scripts[name] === canonical) continue;
      scripts[name] = canonical;
      changed = true;
    }
  }

  if (scripts !== undefined) {
    if (/^bun run check\s*&&\s*/.test(scripts.build ?? "")) {
      scripts.build = scripts.build!.replace(/^bun run check\s*&&\s*/, "");
      changed = true;
    }
  }

  if (manifest.devEngines !== undefined) {
    delete manifest.devEngines;
    changed = true;
  }

  return changed ? serializeJson(manifest) : content;
}
