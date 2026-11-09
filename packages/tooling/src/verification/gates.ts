import type { VerificationPlan } from "./plan.js";

export const gateDefinitions = [
  { name: "javascript", flag: undefined },
  { name: "container-smoke", flag: "container_smoke" },
  { name: "backend", flag: "backend" },
  { name: "browser", flag: "browser" },
  { name: "desktop", flag: "native" },
] as const;

export function requiredGates(flags: Record<string, string>) {
  return gateDefinitions.map(({ name, flag }) => ({
    name,
    required: flag === undefined || flags[flag] === "true",
  }));
}

export function ciOutputs(plan: VerificationPlan & { distribution: boolean }, revision: string) {
  if (!revision) throw new Error("CI plan requires a commit revision");
  return {
    rust: String(plan.native),
    native: String(plan.nativeRunners.length > 0),
    native_runners: JSON.stringify(plan.nativeRunners),
    container_smoke: String(plan.containerSmoke),
    backend: String(plan.backend),
    browser: String(plan.browser !== "none"),
    distribution: String(plan.distribution),
    plan: JSON.stringify({ version: 2, revision, plan }),
  };
}

/** Workers execute the analyzed commit's plan rather than rediscovering scope in each job. */
export function parseCiPlan(
  raw: string,
  revision: string,
): VerificationPlan & { distribution: boolean } {
  const envelope = JSON.parse(raw) as Record<string, unknown>;
  if (envelope?.version !== 2 || !revision || envelope.revision !== revision)
    throw new Error("Unsupported CI plan or commit revision mismatch");
  const plan = envelope.plan as Record<string, unknown> | undefined;
  const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  if (
    !plan ||
    !["full", "native", "backend", "containerSmoke", "distribution"].every(
      (key) => typeof plan[key] === "boolean",
    ) ||
    !["reasons", "files", "workspaces", "tasks", "artifacts", "nativeRunners"].every((key) =>
      strings(plan[key]),
    ) ||
    typeof plan.browser !== "string" ||
    !["none", "web", "desktop", "all"].includes(plan.browser)
  )
    throw new Error("CI plan is incomplete");
  const decoded = plan as unknown as VerificationPlan & { distribution: boolean };
  if (
    decoded.artifacts.some((name) => !["api", "web", "relay", "cli"].includes(name)) ||
    decoded.nativeRunners.some((name) => !["macos-latest", "windows-latest"].includes(name)) ||
    new Set(decoded.nativeRunners).size !== decoded.nativeRunners.length ||
    (!decoded.native && decoded.nativeRunners.length > 0) ||
    (decoded.distribution && decoded.nativeRunners.length === 0)
  )
    throw new Error("CI plan has inconsistent acceptance targets");
  return decoded;
}
