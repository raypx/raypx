import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTOML } from "confbox/toml";
import { parseYAML } from "confbox/yaml";
import { checkWorkspaceConfiguration } from "./workspaces.ts";

type Manifest = {
  packageManager?: string;
  engines?: { node?: string };
  devEngines?: Record<string, { name?: string; version?: string; onFail?: string }>;
};
const manifestAt = (root: string): Manifest =>
  JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
export function readNodePin(root: string) {
  const node = manifestAt(root).engines?.node;
  if (!node || !/^\d+\.\d+\.\d+$/.test(node))
    throw new Error("Pin an exact Node version in package.json engines.node");
  return node;
}
export function readPnpmPin(root: string) {
  const pnpm = /^pnpm@(\d+\.\d+\.\d+)$/.exec(manifestAt(root).packageManager ?? "")?.[1];
  if (!pnpm) throw new Error("Pin an exact pnpm version in package.json packageManager");
  return pnpm;
}
export function checkToolchain(root: string, documents: readonly string[]) {
  let node: string, pnpm: string;
  try {
    node = readNodePin(root);
    pnpm = readPnpmPin(root);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }
  const findings: string[] = [...checkWorkspaceConfiguration(root)];
  const manifest = manifestAt(root);
  for (const [key, name, version] of [
    ["runtime", "node", node],
    ["packageManager", "pnpm", pnpm],
  ]) {
    const engine = manifest.devEngines?.[key!];
    if (engine?.name !== name || engine?.version !== version || engine?.onFail !== "error")
      findings.push(`package.json: devEngines.${key} must require ${name}@${version}`);
  }
  for (const file of [
    "bun.lock",
    "bunfig.toml",
    ".bun-version",
    ".nvmrc",
    ".node-version",
    ".tool-versions",
  ])
    if (existsSync(join(root, file))) findings.push(`${file}: use the root Node/pnpm pins only`);
  try {
    const mise = parseTOML<{
      tools?: unknown;
      settings?: { idiomatic_version_file_enable_tools?: string[] };
    }>(readFileSync(join(root, "mise.toml"), "utf8"));
    if (
      mise.tools ||
      JSON.stringify(mise.settings?.idiomatic_version_file_enable_tools) !==
        JSON.stringify(["node"])
    )
      findings.push("mise.toml: read the package.json Node pin without a tools section");
    const rust = parseTOML<{
      toolchain?: { channel?: string };
    }>(readFileSync(join(root, "rust-toolchain.toml"), "utf8"));
    if (!/^\d+\.\d+\.\d+$/.test(rust.toolchain?.channel ?? ""))
      findings.push("rust-toolchain.toml: pin an exact Rust release");
  } catch {
    findings.push("Invalid runtime manager configuration");
  }
  const rustPin = parseTOML<{ toolchain: { channel: string } }>(
    readFileSync(join(root, "rust-toolchain.toml"), "utf8"),
  ).toolchain.channel;
  if (existsSync(join(root, "Cargo.toml"))) {
    const cargo = parseTOML<{
      workspace?: { package?: { "rust-version"?: string } };
    }>(readFileSync(join(root, "Cargo.toml"), "utf8"));
    if (cargo.workspace?.package?.["rust-version"] !== rustPin)
      findings.push("Cargo.toml: rust-version must match rust-toolchain.toml");
  }
  for (const file of globSync("**/Dockerfile", {
    cwd: root,
    exclude: ["**/node_modules/**", ".claude/**"],
  })) {
    const source = readFileSync(join(root, file), "utf8");
    if (/^FROM\s+(oven\/bun|golang):/m.test(source))
      findings.push(`${file}: Bun and Go images are unsupported`);
    for (const [, version] of source.matchAll(/^ARG NODE_VERSION=(\S+)/gm))
      if (version !== node) findings.push(`${file}: Node image must use ${node}`);
    for (const [, version] of source.matchAll(/^FROM\s+rust:(\d+\.\d+\.\d+)/gm))
      if (version !== rustPin) findings.push(`${file}: Rust image must use ${rustPin}`);
    for (const [, version] of source.matchAll(/^FROM\s+node:(\d+\.\d+\.\d+)/gm))
      if (version !== node) findings.push(`${file}: Node image must use ${node}`);
  }
  for (const file of globSync(
    [".github/workflows/*.{yml,yaml}", ".github/actions/**/action.{yml,yaml}"],
    { cwd: root },
  )) {
    type Step = { uses?: string; with?: Record<string, unknown> };
    let document: { runs?: { steps?: Step[] }; jobs?: Record<string, { steps?: Step[] }> };
    try {
      document = parseYAML<typeof document>(readFileSync(join(root, file), "utf8"));
    } catch {
      findings.push(`${file}: invalid YAML`);
      continue;
    }
    const steps = [
      ...(document.runs?.steps ?? []),
      ...Object.values(document.jobs ?? {}).flatMap((job) => job.steps ?? []),
    ];
    for (const step of steps) {
      if (/^(oven-sh\/setup-bun|actions\/setup-go)@/.test(step.uses ?? ""))
        findings.push(`${file}: obsolete runtime setup`);
      if (
        (step.uses ?? "").startsWith("actions/setup-node@") &&
        (step.with?.["node-version-file"] !== "package.json" || step.with?.["node-version"])
      )
        findings.push(`${file}: setup-node must read package.json`);
      if ((step.uses ?? "").startsWith("pnpm/action-setup@") && step.with?.version)
        findings.push(`${file}: pnpm setup must read packageManager`);
    }
  }
  for (const file of documents)
    if (existsSync(join(root, file))) {
      const source = readFileSync(join(root, file), "utf8").replaceAll("**", "");
      for (const [, version] of source.matchAll(/\bNode v?(\d+\.\d+\.\d+)\b/g))
        if (version !== node) findings.push(`${file}: documented Node must use ${node}`);
      for (const [, version] of source.matchAll(/\bpnpm v?(\d+\.\d+\.\d+)\b/g))
        if (version !== pnpm) findings.push(`${file}: documented pnpm must use ${pnpm}`);
    }
  return [...new Set(findings)];
}
