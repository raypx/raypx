import { readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { discover, exportPaths } from "@raypx-kit/devkit/workspaces";
import { sourceExtensions, toolingSourceClosure } from "../tooling-entries.ts";

const privateVerification = "src/verification";
const sourceFiles = `*.{${[...sourceExtensions, "json", "jsonc"].join(",")}}`;

export function workspaceCheckInput(path: string) {
  return `${path}/**/${sourceFiles}`;
}

function directories(root: string, path: string, omit: string) {
  return readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) => entry.name !== omit && (entry.isDirectory() || entry.isSymbolicLink()))
    .map((entry) => {
      if (!/^[\w.-]+$/.test(entry.name))
        throw new Error(`Unsupported input directory: ${entry.name}`);
      return workspaceCheckInput(`${path}/${entry.name}`);
    })
    .sort();
}

export function toolingConsumerCheckInputs(root: string, path: string) {
  const full = [workspaceCheckInput(path)];
  try {
    const index = discover(root, { metadataKey: "raypx" });
    const tooling = index.byName.get("@raypx/tooling");
    const entries = Object.entries(tooling?.manifest.exports ?? {});
    if (!tooling || !entries.length) return full;

    const closure = toolingSourceClosure(index, tooling);
    const privateDirectory = `${path}/${privateVerification}/`;
    for (const [name, value] of entries) {
      const sources = exportPaths(value);
      if (name.includes("*") || !sources.length) return full;
      for (const source of sources) {
        if (!source.startsWith("./") || source.includes("*")) return full;
        if (
          [...closure(posix.join(path, source))].some((file) => file.startsWith(privateDirectory))
        )
          return full;
      }
    }
    // Only narrow the explicit fallback. VP can still trace any actual reads by check scripts.
    return [
      `${path}/${sourceFiles}`,
      ...directories(root, path, "src"),
      `${path}/src/${sourceFiles}`,
      ...directories(root, `${path}/src`, "verification"),
    ];
  } catch {
    return full;
  }
}
