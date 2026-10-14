import { parseJson, isObject, serializeJson } from "./json.js";
import { findingFor } from "./findings.js";
import type { PolicyFinding } from "./checks.js";

/** Where the shared presets live, relative to the repository root. */
export const presetRoot = "packages/tsconfig";

/** Discover presets without enumerating their filenames. */
export function isPresetFile(file: string): boolean {
  return (
    file.startsWith(`${presetRoot}/`) &&
    file.endsWith(".json") &&
    file !== `${presetRoot}/package.json`
  );
}

/** The specifier prefix a workspace uses to reach them. */
export const presetSpecifier = "@voidmix/tsconfig/";

/** A workspace does not inherit from the shared presets. */
const presetFinding = findingFor("tsconfig.preset");

/** A workspace restates a value it already inherits. */
const redundantFinding = findingFor("tsconfig.redundant");

interface TypeScriptConfig {
  compilerOptions?: Record<string, unknown>;
  extends?: unknown;
}

const isConfigObject = (value: unknown): value is TypeScriptConfig => isObject(value);

interface InheritedOption {
  /** Repository-relative preset that last set the value. */
  source: string;
  value: unknown;
}

/** Resolves the `@voidmix/tsconfig/` specifier a workspace uses. */
function resolveConsumerPreset(specifier: unknown): string | null {
  if (typeof specifier !== "string" || !specifier.startsWith(presetSpecifier)) return null;
  return `${presetRoot}/${specifier.slice(presetSpecifier.length)}`;
}

/** Resolve a sibling preset without filesystem access. */
function resolveSiblingPreset(specifier: string, from: string): string | null {
  if (!specifier.startsWith("./")) return null;
  return `${from.slice(0, from.lastIndexOf("/"))}/${specifier.slice(2)}`;
}

/** Shared by validation and fixing so both recognize the same overrides. */
function redundantOptions(
  config: TypeScriptConfig,
  inherited: ReadonlyMap<string, InheritedOption>,
): [string, InheritedOption][] {
  const restated: [string, InheritedOption][] = [];
  for (const [key, value] of Object.entries(config.compilerOptions ?? {})) {
    const provided = inherited.get(key);
    // JSON comparison is order-sensitive on arrays, which can only under-report:
    // a reordered `lib` reads as a deliberate override rather than a copy.
    if (provided === undefined || JSON.stringify(provided.value) !== JSON.stringify(value))
      continue;
    restated.push([key, provided]);
  }
  return restated;
}

/** Resolve the preset chain. Nearer options win; invalid or cyclic chains return null. */
function resolveInherited(
  path: string,
  presets: ReadonlyMap<string, string>,
  seen: Set<string> = new Set(),
): Map<string, InheritedOption> | null {
  if (seen.has(path)) return null;
  seen.add(path);

  const content = presets.get(path);
  if (content === undefined) return null;

  const result = parseJson(content);
  if (!result.valid) {
    return null;
  }
  const parsed = result.value;
  if (!isConfigObject(parsed)) return null;

  let inherited = new Map<string, InheritedOption>();
  if (parsed.extends !== undefined) {
    if (typeof parsed.extends !== "string") return null;
    const parent = resolveSiblingPreset(parsed.extends, path);
    if (parent === null) return null;
    const resolved = resolveInherited(parent, presets, seen);
    if (resolved === null) return null;
    inherited = resolved;
  }

  for (const [key, value] of Object.entries(parsed.compilerOptions ?? {})) {
    inherited.set(key, { source: path, value });
  }
  return inherited;
}

/** Validate preset inheritance and redundant compiler options; preserve intentional overrides. */
export function validateWorkspaceTypeScriptConfig(
  location: string,
  content: string,
  presets: ReadonlyMap<string, string>,
): PolicyFinding[] {
  const result = parseJson(content);
  if (!result.valid) {
    return [
      presetFinding(
        location,
        "is not valid JSON",
        `repair ${location}; policy parses it as strict JSON, so it must carry no comments`,
      ),
    ];
  }
  const parsed = result.value;
  if (!isConfigObject(parsed)) {
    return [
      presetFinding(
        location,
        "is not a JSON object",
        `repair ${location}; the TypeScript config must be a JSON object`,
      ),
    ];
  }
  const config = parsed;

  if (typeof config.extends !== "string") {
    return [
      presetFinding(
        location,
        config.extends === undefined
          ? "declares no extends, so it inherits none of the shared compiler options"
          : "extends a list rather than a single preset",
        `set extends in ${location} to a ${presetSpecifier}*.json preset`,
      ),
    ];
  }

  if (!config.extends.startsWith(presetSpecifier)) {
    return [
      presetFinding(
        location,
        `extends ${config.extends} instead of a shared preset`,
        `set extends in ${location} to a ${presetSpecifier}*.json preset`,
      ),
    ];
  }

  const path = resolveConsumerPreset(config.extends);
  const inherited = path === null ? null : resolveInherited(path, presets);
  if (inherited === null) {
    const chainIsBroken = path !== null && presets.has(path);
    return [
      presetFinding(
        location,
        chainIsBroken
          ? `extends ${config.extends}, but its preset chain is invalid`
          : `extends ${config.extends}, which is not a preset ${presetRoot} exports`,
        chainIsBroken
          ? `repair the preset chain rooted at ${path} under ${presetRoot}`
          : `point extends in ${location} at an existing preset under ${presetRoot}`,
      ),
    ];
  }

  return redundantOptions(config, inherited).map(([key, provided]) =>
    redundantFinding(
      location,
      `restates ${key}, which ${provided.source} already sets to the same value`,
      `delete ${key} from the compilerOptions in ${location}`,
    ),
  );
}

/** Remove redundant options only from resolvable configs; preserve bytes on a no-op. */
export function fixWorkspaceTypeScriptConfig(
  content: string,
  presets: ReadonlyMap<string, string>,
): string {
  const result = parseJson(content);
  if (!result.valid) {
    return content;
  }
  const parsed = result.value;
  if (!isConfigObject(parsed)) return content;
  const config = parsed;

  const path = resolveConsumerPreset(config.extends);
  const inherited = path === null ? null : resolveInherited(path, presets);
  if (inherited === null) return content;

  const redundant = redundantOptions(config, inherited);
  if (redundant.length === 0) return content;

  for (const [key] of redundant) delete config.compilerOptions?.[key];
  if (Object.keys(config.compilerOptions ?? {}).length === 0) delete config.compilerOptions;

  return serializeJson(config);
}
