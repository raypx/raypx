import { findingFor } from "../findings.js";
import type { PolicyFinding } from "../checks.js";
import type { WorkspaceShape } from "../manifests.js";

const wiringFinding = findingFor("tests.wiring", "warn");

export function validateTestWiring(location: string, shape: WorkspaceShape): PolicyFinding[] {
  if (!shape.hasVitestConfig || shape.hasTestFiles) return [];
  return [
    wiringFinding(
      location,
      "has a vitest.config.ts and no test file, so its test scripts prove nothing",
      `add a test under ${location.replace(/\/[^/]+$/, "/src")}, or remove the vitest.config.ts and its test scripts`,
    ),
  ];
}
