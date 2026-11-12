import type { VerificationPlan } from "./plan.js";

export type SourcePhase = "checks" | "tests";
export type CiPlan = VerificationPlan & { distribution: boolean };
const ciPlanVersion = 3;

/** Keep native checks together; workspace suites run on their own runner. */
export function sourceTasks(plan: VerificationPlan, phase: SourcePhase) {
  return plan.tasks.filter((task) => task.endsWith("#test") === (phase === "tests"));
}

export function sourcePhases(plan: VerificationPlan): SourcePhase[] {
  return sourceTasks(plan, "tests").length ? ["checks", "tests"] : ["checks"];
}

export const gateDefinitions = [
  { name: "source", flag: undefined },
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

export function ciOutputs(plan: CiPlan, revision: string) {
  if (!revision) throw new Error("CI plan requires a commit revision");
  return {
    source_phases: JSON.stringify(sourcePhases(plan)),
    go: String(plan.native),
    native: String(plan.nativeRunners.length > 0),
    native_runners: JSON.stringify(plan.nativeRunners),
    container_smoke: String(plan.containerSmoke),
    backend: String(plan.backend),
    browser: String(Object.values(plan.browser).some(({ mode }) => mode !== "none")),
    distribution: String(plan.distribution),
    plan: JSON.stringify({ version: ciPlanVersion, revision, plan }),
  };
}

/** Workers execute the analyzed commit's plan rather than rediscovering scope in each job. */
export function parseCiPlan(raw: string, revision: string): CiPlan {
  const envelope = JSON.parse(raw) as Record<string, unknown>;
  if (envelope?.version !== ciPlanVersion || !revision || envelope.revision !== revision)
    throw new Error("Unsupported CI plan or commit revision mismatch");
  const plan = envelope.plan as Record<string, unknown> | undefined;
  const strings = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  const browser = plan?.browser as
    | Record<string, { mode?: unknown; reasons?: unknown }>
    | undefined;
  if (
    !plan ||
    !["full", "native", "backend", "containerSmoke", "distribution"].every(
      (key) => typeof plan[key] === "boolean",
    ) ||
    !["reasons", "files", "workspaces", "tasks", "artifacts", "nativeRunners"].every((key) =>
      strings(plan[key]),
    ) ||
    (plan.baseline !== undefined &&
      (typeof plan.baseline !== "string" || !/^[0-9a-f]{40}$/.test(plan.baseline))) ||
    !browser ||
    Object.keys(browser).length !== 2 ||
    !["web", "desktop"].every((surface) => {
      const entry = browser[surface];
      return (
        entry &&
        (entry.mode === "none" || entry.mode === "smoke" || entry.mode === "full") &&
        strings(entry.reasons) &&
        (entry.mode === "none") === (entry.reasons.length === 0)
      );
    })
  )
    throw new Error("CI plan is incomplete");
  const decoded = plan as unknown as CiPlan;
  if (
    decoded.artifacts.some((name) => !["api", "web", "cli"].includes(name)) ||
    decoded.nativeRunners.some((name) => !["macos-latest", "windows-latest"].includes(name)) ||
    new Set(decoded.nativeRunners).size !== decoded.nativeRunners.length ||
    (!decoded.native && decoded.nativeRunners.length > 0) ||
    (decoded.distribution && decoded.nativeRunners.length === 0)
  )
    throw new Error("CI plan has inconsistent acceptance targets");
  return decoded;
}
