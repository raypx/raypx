import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskModel } from "./types.js";

export function repositoryRoot(directory: string): string {
  let current = realpathSync(directory);
  while (true) {
    const file = join(current, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).workspaces) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("Task config needs a workspace repository");
    current = parent;
  }
}
export function taskSelection(
  root: string,
  tasks: string,
  selectedRoot: string,
  environment = process.env,
): string | undefined {
  const canonical = (path: string) => (existsSync(path) ? realpathSync(path) : resolve(path));
  return environment[selectedRoot] && canonical(environment[selectedRoot]) === canonical(root)
    ? environment[tasks]
    : undefined;
}
export function taskConfig(model: TaskModel, url: string) {
  const path = relative(
    realpathSync(model.root),
    realpathSync(dirname(fileURLToPath(url))),
  ).replaceAll("\\", "/");
  const owner = path ? model.members.find((member) => member.path === path)?.name : model.rootName;
  if (!owner) throw new Error(`No workspace owns ${path}`);
  const prefix = `${owner}#`;
  return {
    run: {
      ...(!path ? { cache: { scripts: false, tasks: true } } : {}),
      tasks: Object.fromEntries(
        [...model.definitions]
          .filter(([ref]) => ref.startsWith(prefix))
          .map(([ref, definition]) => [ref.slice(prefix.length), definition]),
      ),
    },
  };
}
