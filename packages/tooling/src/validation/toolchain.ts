import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workspacePatterns } from "@raypx-kit/devkit/workspaces";

type Manifest = Record<string, any>;

const manifestAt = (root: string, file = "package.json"): Manifest =>
  JSON.parse(readFileSync(join(root, file), "utf8"));
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The root `packageManager` is the single Bun pin; Bun is the only JavaScript runtime. */
export function readBunPin(root: string): string {
  const bun = /^bun@(\d+\.\d+\.\d+)$/.exec(manifestAt(root).packageManager ?? "")?.[1];
  if (!bun) throw new Error("Pin an exact Bun version in package.json packageManager.");
  return bun;
}

function checkMise(root: string): string[] {
  const file = "mise.toml";
  if (!existsSync(join(root, file))) return [`${file}: missing runtime manager configuration`];
  let mise: unknown;
  try {
    mise = Bun.TOML.parse(readFileSync(join(root, file), "utf8"));
  } catch {
    return [`${file}: invalid TOML configuration`];
  }
  if (!isRecord(mise)) return [`${file}: configuration must be a table`];
  const findings: string[] = [];
  if (Object.hasOwn(mise, "tools"))
    findings.push(`${file}: read existing pins instead of declaring [tools] versions`);
  const tools = isRecord(mise.settings) ? mise.settings.idiomatic_version_file_enable_tools : [];
  if (!Array.isArray(tools) || tools.length !== 1 || tools[0] !== "bun")
    findings.push(`${file}: enable idiomatic version files for bun only`);
  return findings;
}

function setupSteps(root: string): { file: string; step: Record<string, unknown> }[] {
  const steps: { file: string; step: Record<string, unknown> }[] = [];
  const collect = (file: string, list: unknown) => {
    if (Array.isArray(list))
      for (const step of list) if (isRecord(step)) steps.push({ file, step });
  };
  for (const file of globSync(
    [".github/workflows/*.{yml,yaml}", ".github/actions/**/action.{yml,yaml}"],
    { cwd: root },
  )) {
    let document: unknown;
    try {
      document = Bun.YAML.parse(readFileSync(join(root, file), "utf8"));
    } catch {
      steps.push({ file, step: { invalid: true } });
      continue;
    }
    if (!isRecord(document)) continue;
    if (isRecord(document.jobs))
      for (const job of Object.values(document.jobs)) if (isRecord(job)) collect(file, job.steps);
    if (isRecord(document.runs)) collect(file, document.runs.steps);
  }
  return steps;
}

/** Check duplicated runtime declarations without installing tools or running application code. */
export function checkToolchain(root: string, documents: readonly string[]): string[] {
  let bun: string;
  try {
    bun = readBunPin(root);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const findings: string[] = [];
  const manifest = manifestAt(root);
  const expect = (file: string, label: string, actual: string | undefined, expected: string) => {
    if (actual !== expected)
      findings.push(`${file}: ${label} is ${actual ?? "missing"}, expected ${expected}`);
  };
  if (manifest.engines?.node !== undefined)
    findings.push("package.json: remove engines.node; Bun is the only runtime");
  for (const key of ["packageManager", "runtime"]) {
    const engine = manifest.devEngines?.[key];
    expect("package.json", `devEngines.${key}`, `${engine?.name}@${engine?.version}`, `bun@${bun}`);
    expect("package.json", `devEngines.${key}.onFail`, engine?.onFail, "error");
  }
  for (const file of [".nvmrc", ".node-version", ".bun-version", ".tool-versions"])
    if (existsSync(join(root, file)))
      findings.push(`${file}: package.json packageManager is the only runtime pin`);
  findings.push(...checkMise(root));
  const typesVersion = (range: unknown) =>
    typeof range === "string" && !/^[a-z]+:/.test(range) ? range.replace(/^[\^~]/, "") : undefined;
  const workspaces = manifest.workspaces;
  const catalogs = isRecord(workspaces)
    ? [
        workspaces.catalog,
        ...Object.values(isRecord(workspaces.catalogs) ? workspaces.catalogs : {}),
      ]
    : [];
  const typed = [
    ...catalogs.map((catalog) => ["package.json catalog", catalog] as const),
    ...[
      "package.json",
      ...globSync(
        workspacePatterns(manifest).map((path) => `${path}/package.json`),
        { cwd: root },
      ),
    ].map((file) => [file, manifestAt(root, file).devDependencies] as const),
  ];
  for (const [file, dependencies] of typed) {
    if (!isRecord(dependencies)) continue;
    const version = typesVersion(dependencies["@types/bun"]);
    if (version) expect(file, "@types/bun", version, bun);
  }
  for (const file of globSync("**/Dockerfile", { cwd: root, exclude: ["**/node_modules/**"] })) {
    const source = readFileSync(join(root, file), "utf8");
    if (/^FROM\s+node:/m.test(source)) findings.push(`${file}: build and run on oven/bun images`);
    for (const [, version] of source.matchAll(/^FROM\s+oven\/bun:(\d+\.\d+\.\d+)/gm))
      expect(file, "bun image", version, bun);
  }
  for (const { file, step } of setupSteps(root)) {
    if (step.invalid) {
      findings.push(`${file}: invalid YAML configuration`);
      continue;
    }
    const uses = typeof step.uses === "string" ? step.uses.toLowerCase() : "";
    if (uses.startsWith("actions/setup-node@"))
      findings.push(`${file}: remove actions/setup-node; Bun is the only runtime`);
    if (!uses.startsWith("oven-sh/setup-bun@")) continue;
    const inputs = isRecord(step.with) ? step.with : {};
    if (Object.hasOwn(inputs, "bun-version"))
      findings.push(`${file}: read bun-version-file: package.json instead of a literal version`);
    if (inputs["bun-version-file"] !== "package.json")
      findings.push(`${file}: every bun setup must read package.json`);
  }
  for (const file of documents) {
    if (!existsSync(join(root, file))) continue;
    const document = readFileSync(join(root, file), "utf8").replaceAll("**", "");
    for (const [, version] of document.matchAll(/\bBun v?(\d+\.\d+\.\d+)\b/g))
      expect(file, "documented Bun", version, bun);
    if (/\bNode v?\d+\.\d+\.\d+\b/.test(document))
      findings.push(`${file}: documents a Node release; Bun is the only runtime`);
  }
  return [...new Set(findings)];
}
