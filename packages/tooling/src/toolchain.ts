import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Toolchain {
  node: string;
  bun: string;
}
const exact = /^\d+\.\d+\.\d+$/;

/** `.nvmrc` pins Node and the root `packageManager` pins Bun; every other pin follows them. */
export function readToolchain(root: string): Toolchain {
  const node = readFileSync(join(root, ".nvmrc"), "utf8").trim().replace(/^v/, "");
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    packageManager?: string;
  };
  const bun = /^bun@(.+)$/.exec(manifest.packageManager ?? "")?.[1] ?? "";
  if (!exact.test(node) || !exact.test(bun))
    throw new Error("Pin exact versions in .nvmrc and package.json packageManager (bun@x.y.z)");
  return { node, bun };
}

/** Returns the Node binary for artifact probes after confirming it is the pinned release. */
export function pinnedNode(root: string): string {
  const { node: version } = readToolchain(root);
  const node = process.env.RAYPX_NODE_BINARY ?? "node";
  const output = Bun.spawnSync([node, "--version"]);
  if (new TextDecoder().decode(output.stdout).trim() !== `v${version}`)
    throw new Error(
      `Select Node ${version} (nvm use "$(cat .nvmrc)") or set RAYPX_NODE_BINARY to it`,
    );
  return node;
}

interface Manifest {
  engines?: { node?: string };
  devEngines?: Record<string, { name?: string; version?: string }>;
  workspaces?: { catalogs?: Record<string, Record<string, string>> };
}
/** Pins that must stay literal (images, engines) are checked against the two sources. */
export function checkToolchain(root: string, documents: string[]): string[] {
  let pins: Toolchain;
  try {
    pins = readToolchain(root);
  } catch (error) {
    return [String(error instanceof Error ? error.message : error)];
  }
  const findings: string[] = [];
  const expect = (file: string, label: string, actual: string | undefined, wanted: string) => {
    if (actual !== wanted)
      findings.push(`${file}: ${label} is ${actual ?? "missing"}, expected ${wanted}`);
  };
  // Version managers read the two sources directly; a second pin file would drift.
  for (const file of [".node-version", ".bun-version", ".tool-versions"])
    if (existsSync(join(root, file)))
      findings.push(`${file}: remove it; .nvmrc and package.json pin the toolchain`);
  for (const file of ["mise.toml", ".mise.toml"]) {
    const path = join(root, file);
    if (existsSync(path) && /^\s*\[tools[\].]/m.test(readFileSync(path, "utf8")))
      findings.push(`${file}: do not pin [tools]; mise reads .nvmrc and package.json`);
  }
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;
  expect("package.json", "engines.node", manifest.engines?.node, pins.node);
  for (const key of ["packageManager", "runtime"]) {
    const engine = manifest.devEngines?.[key];
    expect(
      "package.json",
      `devEngines.${key}`,
      `${engine?.name}@${engine?.version}`,
      `bun@${pins.bun}`,
    );
  }
  const types = manifest.workspaces?.catalogs?.dev?.["@types/bun"];
  if (types) expect("package.json", "catalog @types/bun", types, pins.bun);

  const dockerfiles = globSync("**/Dockerfile", { cwd: root, exclude: ["**/node_modules/**"] });
  for (const file of dockerfiles) {
    const source = readFileSync(join(root, file), "utf8");
    for (const [, version] of source.matchAll(/^FROM\s+node:(\d+\.\d+\.\d+)/gm))
      expect(file, "node image", version, pins.node);
    for (const [, version] of source.matchAll(/^FROM\s+oven\/bun:(\d+\.\d+\.\d+)/gm))
      expect(file, "bun image", version, pins.bun);
  }

  for (const file of globSync(".github/workflows/*.{yml,yaml}", { cwd: root })) {
    const source = readFileSync(join(root, file), "utf8");
    const files = (key: string) =>
      [...source.matchAll(new RegExp(`^\\s*${key}-file:\\s*(\\S+)`, "gm"))].map((m) => m[1]);
    if (/^\s*node-version:/m.test(source) || files("node-version").some((f) => f !== ".nvmrc"))
      findings.push(`${file}: select Node with node-version-file: .nvmrc`);
    if (/^\s*bun-version:/m.test(source) || files("bun-version").some((f) => f !== "package.json"))
      findings.push(`${file}: select Bun with bun-version-file: package.json`);
  }

  for (const file of documents) {
    const source = readFileSync(join(root, file), "utf8");
    for (const [, tool, version] of source.matchAll(/\b(Node|Bun) v?(\d+\.\d+\.\d+)\b/g))
      expect(file, `documented ${tool}`, version, tool === "Node" ? pins.node : pins.bun);
  }
  return [...new Set(findings)];
}
