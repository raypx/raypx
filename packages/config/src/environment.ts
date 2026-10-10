import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface DevelopmentEnvironment {
  nodeVersion: string;
  bunVersion: string;
  packageManagerName?: string;
  packageManagerVersion?: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nodeRelease(version: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  return match
    ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
    : undefined;
}

export function checkDevelopmentEnvironment(
  root: string,
  actual: DevelopmentEnvironment,
): string[] {
  const errors: string[] = [];
  let manifest: Record<string, unknown>;
  try {
    manifest = record(JSON.parse(readFileSync(join(root, "package.json"), "utf8")));
  } catch {
    return ["package.json could not be read as JSON."];
  }

  function pin(file: string): string | undefined {
    try {
      const version = readFileSync(join(root, file), "utf8").trim();
      if (/^\d+\.\d+\.\d+$/.test(version)) return version;
    } catch {
      // Report an actionable message for missing and invalid version files alike.
    }
    errors.push(`${file} must contain an exact version (major.minor.patch).`);
    return undefined;
  }

  const nodePin = pin(".node-version");
  const bunPin = pin(".bun-version");
  const devEngines = record(manifest.devEngines);

  function engine(field: string, name: string): string | undefined {
    const declaration = record(devEngines[field]);
    const versionPattern =
      field === "runtime" ? /^\^[1-9]\d*\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/ : /^\d+\.\d+\.\d+$/;
    const versionRequirement =
      field === "runtime" ? "a ^major.minor.patch range" : "an exact version";
    if (
      declaration.name !== name ||
      typeof declaration.version !== "string" ||
      !versionPattern.test(declaration.version) ||
      (declaration.onFail !== undefined && declaration.onFail !== "error")
    ) {
      errors.push(
        `devEngines.${field} must require ${name} using ${versionRequirement} with onFail: error.`,
      );
      return undefined;
    }
    return declaration.version;
  }

  function match(label: string, expected: string | undefined, found: unknown): void {
    if (expected !== undefined && found !== expected) {
      const description =
        typeof found === "string" ? found : found == null ? "missing" : "invalid value";
      errors.push(`${label}: expected ${expected}, found ${description}.`);
    }
  }

  const nodeRange = engine("runtime", "node");
  const bunVersion = engine("packageManager", "bun");
  match("devEngines.runtime / .node-version", nodePin ? `^${nodePin}` : undefined, nodeRange);
  match("devEngines.packageManager / .bun-version", bunPin, bunVersion);
  const expectedBun = bunVersion ?? bunPin;
  match("packageManager", expectedBun ? `bun@${expectedBun}` : undefined, manifest.packageManager);
  match("engines.bun", expectedBun, record(manifest.engines).bun);
  if (nodeRange !== undefined) {
    const minimum = nodeRelease(nodeRange.slice(1));
    const found = actual.nodeVersion.replace(/^v/, "");
    const release = nodeRelease(found);
    if (
      !minimum ||
      !release ||
      release.major !== minimum.major ||
      release.minor < minimum.minor ||
      (release.minor === minimum.minor && release.patch < minimum.patch)
    ) {
      errors.push(`Node.js runtime: expected ${nodeRange} (stable release), found ${found}.`);
    }
  }
  match("Bun runtime", bunVersion, actual.bunVersion.replace(/^v/, ""));

  if (actual.packageManagerName !== undefined) {
    match("Package manager", "bun", actual.packageManagerName);
    if (actual.packageManagerName === "bun" && actual.packageManagerVersion !== undefined) {
      match("Package manager version", bunVersion, actual.packageManagerVersion);
    }
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  let nodeVersion = "unavailable (install Node.js and add it to PATH)";
  try {
    nodeVersion = execFileSync("node", ["--version"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    }).trim();
  } catch {
    // Bun's process.versions.node describes compatibility, not the toolchain on PATH.
  }
  const manager = process.env.npm_config_user_agent?.split(" ")[0]?.split("/");
  const errors = checkDevelopmentEnvironment(root, {
    nodeVersion,
    bunVersion: process.versions.bun ?? "unavailable (run this check with Bun)",
    ...(manager?.[0] ? { packageManagerName: manager[0] } : {}),
    ...(manager?.[1] ? { packageManagerVersion: manager[1] } : {}),
  });
  if (errors.length > 0) {
    console.error("Development environment check failed:");
    for (const error of errors) console.error(`- ${error}`);
    console.error(
      "Use a Node.js version satisfying devEngines.runtime (.node-version is the recommended version) and the Bun version in .bun-version, then run bun run check:env.",
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Development environment passed (Node.js ${nodeVersion}, Bun ${process.versions.bun}).`,
    );
  }
}
