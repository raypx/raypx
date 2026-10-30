import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { repositoryRoot, taskConfig } from "@raypx-kit/devkit/tasks";
import { taskModel } from "./model.js";
export function workspaceTaskConfig(url: string) {
  return taskConfig(taskModel(repositoryRoot(dirname(fileURLToPath(url)))), url);
}
export function repositoryTaskConfig(url: string) {
  return workspaceTaskConfig(url);
}
