import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryRoot, taskConfig } from "./core.js";
import { taskModel } from "./model.js";
export function workspaceTaskConfig(url: string) {
  return taskConfig(taskModel(repositoryRoot(dirname(fileURLToPath(url)))), url);
}
