import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { discover } from "../repository.js";

export interface CaseIdentity {
  workspace: string;
  file: string;
  name: string;
}
interface TestCase extends CaseIdentity {
  status: string;
  durationMs: number;
}
interface Source {
  workspace: string;
  file: string;
  layer: "unit" | "component" | "integration" | "external";
}
export interface Inventory {
  version: 1;
  sources: Source[];
  files: string[];
  cases: TestCase[];
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected a JSON object in test report");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.length) throw new Error("Invalid test report identity");
  return value;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a test report array");
  return value;
}

export function baselineCases(value: unknown): CaseIdentity[] {
  return list(record(value).cases).map((entry) => {
    const row = record(entry);
    return { workspace: string(row.workspace), file: string(row.file), name: string(row.name) };
  });
}

export function compareCases(
  before: CaseIdentity[],
  after: CaseIdentity[],
  owners: Record<string, string> = {},
) {
  for (const file of Object.keys(owners)) {
    if (!before.some((entry) => entry.file === file))
      throw new Error(`Owner mapping does not match a baseline file: ${file}`);
    string(owners[file]);
  }
  const identity = (entry: CaseIdentity) => JSON.stringify([entry.workspace, entry.name]);
  const expected = before.map((entry) => ({
    ...entry,
    workspace: owners[entry.file] ?? entry.workspace,
  }));
  function difference(left: CaseIdentity[], right: CaseIdentity[]) {
    const counts = new Map<string, number>();
    for (const entry of right) counts.set(identity(entry), (counts.get(identity(entry)) ?? 0) + 1);
    return left.filter((entry) => {
      const key = identity(entry),
        count = counts.get(key) ?? 0;
      if (!count) return true;
      counts.set(key, count - 1);
      return false;
    });
  }
  return { missing: difference(expected, after), added: difference(after, expected) };
}

export function ownerMap(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record(value)).map(([key, target]) => [key, string(target)]),
  );
}

export async function collectInventory(root: string, reportNames: string[]): Promise<Inventory> {
  if (!reportNames.length || reportNames.some((name) => !/^[\w-]+\.json$/.test(name)))
    throw new Error("Inventory needs generated report filenames");
  const index = discover(root);
  if (index.findings.length) throw new Error("Fix workspace discovery before collecting tests");
  const sources: Source[] = [],
    files: string[] = [],
    cases: TestCase[] = [];
  for (const workspace of index.workspaces) {
    const directory = join(root, workspace.path);
    const external = Boolean(
      workspace.manifest.scripts?.e2e && !existsSync(join(directory, "vitest.config.ts")),
    );
    for await (const file of new Bun.Glob("tests/**/*.{test,spec}.{ts,tsx}").scan({
      cwd: directory,
    }))
      sources.push({
        workspace: workspace.manifest.name,
        file: join(workspace.path, file).replaceAll("\\", "/"),
        layer:
          external || /^tests\/(postgres|redis)\//.test(file)
            ? "external"
            : file.includes("/component/")
              ? "component"
              : file.includes("/integration/")
                ? "integration"
                : "unit",
      });
    if (!workspace.manifest.scripts?.test) continue;
    for (const name of reportNames) {
      const report = Bun.file(join(directory, "node_modules/.cache/raypx-tests", name));
      // A workspace need not implement every focused layer.
      const layer = name.match(/-(unit|component|integration)\.json$/)?.[1];
      if (layer && !workspace.manifest.scripts[`test:${layer}`]) continue;
      if (!(await report.exists()))
        throw new Error(`Missing report for ${workspace.manifest.name}: ${name}`);
      const result = record(await report.json());
      if (result.success !== true || result.numFailedTests !== 0 || result.numPendingTests !== 0)
        throw new Error(`Incomplete or failed test run: ${workspace.manifest.name}`);
      let passed = 0;
      for (const entry of list(result.testResults)) {
        const file = record(entry);
        const path = relative(root, string(file.name)).replaceAll("\\", "/");
        if (
          !sources.some(
            (source) =>
              source.workspace === workspace.manifest.name &&
              source.file === path &&
              source.layer !== "external",
          )
        )
          throw new Error(`Unexpected ordinary test file: ${path}`);
        files.push(path);
        for (const assertion of list(file.assertionResults)) {
          const test = record(assertion);
          if (test.status !== "passed") throw new Error(`Unpassed test in ${path}`);
          passed++;
          cases.push({
            workspace: workspace.manifest.name,
            file: path,
            name: string(test.fullName),
            status: "passed",
            durationMs: typeof test.duration === "number" ? test.duration : 0,
          });
        }
      }
      if (passed !== result.numPassedTests)
        throw new Error(`Test count mismatch: ${workspace.manifest.name}`);
    }
  }
  if (new Set(files).size !== files.length)
    throw new Error("A test file was selected more than once");
  const expected = sources
    .filter((source) => source.layer !== "external")
    .map((source) => source.file)
    .sort();
  if (JSON.stringify([...files].sort()) !== JSON.stringify(expected))
    throw new Error("Ordinary test source inventory is incomplete");
  return {
    version: 1,
    sources: [...sources].sort((a, b) => a.file.localeCompare(b.file)),
    files: [...files].sort(),
    cases,
  };
}
