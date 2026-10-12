import { findingFor, collectFindings } from "../findings.js";
import type { PolicyFinding } from "../checks.js";
import type { WorkspaceShape } from "../manifests.js";

export const canonicalScripts: Readonly<Record<string, string>> = {
  "test:unit":
    "vp test --run --passWithNoTests --exclude '**/component.test.{ts,tsx}' --exclude '**/*.component.test.{ts,tsx}' --exclude '**/*.integration.test.{ts,tsx}'",
  "test:integration": "vp test --run --passWithNoTests integration.test",
  "test:component": "vp test --run --passWithNoTests component.test",
  "test:coverage":
    "vp test --run --passWithNoTests --coverage --coverage.reporter=text --coverage.reporter=json --coverage.reporter=lcov",
};

export const scriptFinding = findingFor("manifest.scripts");

export const dependencyFinding = findingFor("manifest.dependencies");

export const engineFinding = findingFor("manifest.engines");

export function structureFinding(location: string, field: string): PolicyFinding {
  return {
    check: "manifest.structure",
    location,
    message: `${field} must be an object whose values are strings`,
    fix: `repair ${field} in ${location}; use an object with string values`,
    severity: "error",
  };
}

export function expandScript(
  scripts: Readonly<Record<string, string>>,
  name: string,
  depth = 0,
): string | undefined {
  const command = scripts[name];
  if (command === undefined || depth >= 3) return command;
  return command.replace(
    /bun run ([\w:-]+)/g,
    (match, referenced: string) => expandScript(scripts, referenced, depth + 1) ?? match,
  );
}

export function validateScripts(
  location: string,
  scripts: Readonly<Record<string, string>>,
  shape: WorkspaceShape,
): PolicyFinding[] {
  const { findings, report } = collectFindings(scriptFinding);
  for (const [name, canonical] of Object.entries(canonicalScripts)) {
    const declared = scripts[name];
    if (!shape.hasVitestConfig) {
      if (declared !== undefined) {
        report(
          location,
          `declares ${name} without a vitest.config.ts to run it`,
          `remove ${name} from ${location}, or add a vitest.config.ts to the workspace`,
        );
      }
      continue;
    }
    if (declared === undefined) {
      report(
        location,
        `does not declare ${name}, so Turbo skips this workspace`,
        `add to ${location}: "${name}": "${canonical}"`,
      );
    } else if (declared !== canonical) {
      report(
        location,
        `${name} does not match the repository-wide command`,
        `set ${name} in ${location} to: ${canonical}`,
      );
    }
  }

  const check = expandScript(scripts, "check");
  if (shape.typeScriptConfigs.length > 0 && check === undefined) {
    report(
      location,
      "owns a TypeScript project but declares no check script",
      `add to ${location}: "check": "tsc --noEmit -p ${shape.typeScriptConfigs[0]}"`,
    );
  }
  if (check !== undefined) {
    for (const config of shape.typeScriptConfigs) {
      if (check.includes(`-p ${config}`)) continue;
      report(
        location,
        `check does not type-check ${config}, so nothing ever does`,
        `extend the check script in ${location} with: tsc --noEmit -p ${config}`,
      );
    }
  }

  if (Object.values(scripts).some((command) => /\bvp\s+run\b/.test(command))) {
    report(
      location,
      "uses a second task runner",
      "use Turbo for workspace orchestration and Vite+ leaf commands only",
    );
  }
  if (/^bun run check\s*&&/.test(scripts.build ?? "")) {
    report(
      location,
      "build repeats the check owned by the Turbo task graph",
      `remove the bun run check prefix from ${location}; turbo.json owns the build -> check dependency`,
    );
  }
  return findings;
}

export function validateDependencies(
  location: string,
  group: string,
  dependencies: Readonly<Record<string, string>>,
): PolicyFinding[] {
  const { findings, report } = collectFindings(dependencyFinding);
  for (const [name, version] of Object.entries(dependencies)) {
    if (name.startsWith("@voidmix/")) {
      if (version === "workspace:*") continue;
      report(
        location,
        `${group} pins ${name} to ${version} instead of the workspace protocol`,
        `set ${name} in ${location} to: workspace:*`,
      );
      continue;
    }
    if (version.startsWith("catalog:")) continue;
    report(
      location,
      `${group} pins ${name} to ${version} instead of a catalog entry`,
      `add ${name} to a root catalog and set it in ${location} to: catalog: or catalog:<name>`,
    );
  }
  return findings;
}
