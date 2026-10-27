import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryRoot, taskModel } from "./model.js";

/** Lightweight task metadata; never imports app plugins or the Native SDK. */
export function workspaceTaskConfig(configUrl: string) {
  const directory = dirname(fileURLToPath(configUrl));
  const root = repositoryRoot(directory);
  const model = taskModel(root);
  const member = model.members.find(
    (candidate) => candidate.path === relative(root, directory).replaceAll("\\", "/"),
  );
  if (!member) throw new Error("Task config is not in a declared workspace");
  const prefix = `${member.name}#`;
  return {
    run: {
      tasks: Object.fromEntries(
        [...model.definitions]
          .filter(([reference]) => reference.startsWith(prefix))
          .map(([reference, task]) => [reference.slice(prefix.length), task]),
      ),
    },
  };
}

export function repositoryTaskConfig(configUrl: string) {
  const root = repositoryRoot(dirname(fileURLToPath(configUrl)));
  const model = taskModel(root);
  const prefix = `${model.rootName}#`;
  return {
    run: {
      cache: { scripts: false, tasks: true },
      tasks: Object.fromEntries(
        [...model.definitions]
          .filter(([reference]) => reference.startsWith(prefix))
          .map(([reference, task]) => [reference.slice(prefix.length), task]),
      ),
    },
  };
}
