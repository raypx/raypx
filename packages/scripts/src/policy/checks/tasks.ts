import { join } from "node:path";
import type { PolicyDependencies, PolicyFinding } from "../checks.js";
import { findingFor } from "../findings.js";

const report = findingFor("tasks.graph");
const uncached = [
  "test",
  "test:integration",
  "test:postgres",
  "test:provider",
  "e2e",
  "e2e:web",
  "e2e:desktop",
  "smoke",
  "deploy",
  "generate",
  "db:migrate",
];
interface TaskDefinition {
  dependsOn?: string[];
  cache?: boolean;
  outputs?: string[];
}

function workerDependsOn(task: TaskDefinition | undefined, edge: string): boolean {
  return (
    Array.isArray(task?.dependsOn) &&
    task.dependsOn.some(
      (dependency) =>
        dependency === edge || (!edge.startsWith("^") && dependency === `worker#${edge}`),
    )
  );
}

/** Nitro owns one portable artifact, so cache restoration must include its complete output. */
function checkWorkerArtifactTasks(
  tasks: Record<string, TaskDefinition>,
  add: (message: string) => void,
) {
  const build = tasks["worker#build"];
  if (tasks["worker#runtime:prepare"] || workerDependsOn(build, "runtime:prepare"))
    add("Worker Nitro builds must not retain the retired runtime:prepare task");
  for (const edge of ["check", "^build", "^transit"])
    if (!workerDependsOn(build, edge)) add(`worker#build must depend on ${edge}`);

  const outputs = Array.isArray(build?.outputs) ? build.outputs : [];
  if (outputs.length !== 1 || outputs[0] !== ".output/**")
    add(
      "worker#build must cache the complete .output/** Nitro artifact, including both executables and runtime dependencies",
    );
}

export function validateTaskGraph(value: unknown): PolicyFinding[] {
  const findings: PolicyFinding[] = [];
  const add = (message: string) =>
    findings.push(
      report(
        "turbo.json",
        message,
        "restore the Turbo task graph and cache boundaries documented in tooling.md",
      ),
    );
  if (!value || typeof value !== "object") {
    add("must define a Turbo task graph");
    return findings;
  }
  const config = value as {
    tasks?: Record<string, TaskDefinition>;
    globalEnv?: string[];
    remoteCache?: { signature?: boolean };
  };
  if (!Array.isArray(config.globalEnv) || !config.globalEnv.includes("RPX_CACHE_PLATFORM"))
    add("cache keys must include the executable platform fingerprint");
  if (config.remoteCache?.signature !== true) add("remote cache artifacts must require signatures");
  for (const edge of ["check", "^build", "^transit"])
    if (
      !Array.isArray(config.tasks?.build?.dependsOn) ||
      !config.tasks.build.dependsOn.includes(edge)
    )
      add(`build must depend on ${edge}`);
  if (
    !Array.isArray(config.tasks?.transit?.dependsOn) ||
    !config.tasks.transit.dependsOn.includes("^transit")
  )
    add("source-export packages must propagate hashes through transit dependencies");
  for (const task of uncached)
    if (config.tasks?.[task]?.cache !== false) add(`${task} must execute every time`);
  for (const [key, task] of Object.entries(config.tasks ?? {}))
    if (key.includes("#") && uncached.includes(key.split("#").at(-1)!) && task?.cache !== false)
      add(`${key} must execute every time`);
  checkWorkerArtifactTasks(config.tasks ?? {}, add);
  return findings;
}

export async function checkTaskGraph(
  deps: Pick<PolicyDependencies, "repositoryRoot" | "readFile" | "pathExists">,
): Promise<PolicyFinding[]> {
  const path = join(deps.repositoryRoot, "turbo.json");
  if (!(await deps.pathExists(path))) return validateTaskGraph(null);
  try {
    return validateTaskGraph(JSON.parse(await deps.readFile(path)));
  } catch {
    return [report("turbo.json", "must contain valid JSON", "repair turbo.json")];
  }
}
