import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { RunnerBinding } from "./types.js";

export const supportedTools = new Set(["read", "write", "edit", "ls", "bash"]);
export async function authorizeBinding(
  input: Omit<RunnerBinding, "localBindingId">,
): Promise<RunnerBinding> {
  if (!input.projectId || !input.model?.provider || !input.model.id)
    throw new Error("Project and model are required.");
  if (input.tools.some((tool) => !supportedTools.has(tool)))
    throw new Error("Unsupported local tool.");
  const path = await realpath(input.path);
  if (!(await lstat(path)).isDirectory()) throw new Error("The project path is not a directory.");
  return { ...input, path, tools: [...new Set(input.tools)], localBindingId: crypto.randomUUID() };
}
export async function enforceProjectPath(root: string, requested: string): Promise<string> {
  const rootPath = await realpath(root);
  const target = resolve(rootPath, requested);
  let ancestor = target;
  while (true) {
    try {
      ancestor = await realpath(ancestor);
      break;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) throw error;
      ancestor = parent;
    }
  }
  for (const candidate of [target, ancestor]) {
    const path = relative(rootPath, candidate);
    if (path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path))
      throw new Error("Tool path is outside the authorized project.");
  }
  return target;
}
