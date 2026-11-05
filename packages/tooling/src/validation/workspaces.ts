import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function workspaceConfiguration(root: string) {
  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const workspaces = manifest.workspaces;
  const packages = Array.isArray(workspaces) ? workspaces : workspaces.packages;
  const configuration = {
    packages,
    catalog: workspaces.catalog,
    catalogs: workspaces.catalogs,
    overrides: manifest.overrides,
    strictPeerDependencies: false,
    engineStrict: true,
    minimumReleaseAge: 0,
    allowBuilds: {
      "@parcel/watcher": true,
      "@swc/core": true,
      esbuild: true,
      sharp: true,
      "unrs-resolver": true,
      "@posthog/cli": true,
      "@railway/cli": true,
      workerd: true,
      "@google/genai": false,
      "core-js": false,
      protobufjs: false,
    },
  };
  const yaml = (value: unknown, indent = 0): string => {
    const prefix = " ".repeat(indent);
    if (Array.isArray(value))
      return value.map((item) => prefix + "- " + JSON.stringify(item) + "\n").join("");
    return Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => {
        if (item && typeof item === "object")
          return prefix + JSON.stringify(key) + ":\n" + yaml(item, indent + 2);
        return prefix + JSON.stringify(key) + ": " + JSON.stringify(item) + "\n";
      })
      .join("");
  };
  return "# Generated from package.json by pnpm run workspace:sync.\n" + yaml(configuration);
}
export function checkWorkspaceConfiguration(root: string) {
  try {
    return readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8") ===
      workspaceConfiguration(root)
      ? []
      : ["pnpm-workspace.yaml: run pnpm run workspace:sync"];
  } catch {
    return ["pnpm-workspace.yaml: run pnpm run workspace:sync"];
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "../../../..");
  if (process.argv.includes("--write"))
    writeFileSync(resolve(root, "pnpm-workspace.yaml"), workspaceConfiguration(root));
  else if (checkWorkspaceConfiguration(root).length) {
    console.error(checkWorkspaceConfiguration(root).join("\n"));
    process.exitCode = 1;
  }
}
