import { resolveRelease } from "./build/release.js";
import { developmentEnvironment } from "@raypx-kit/devkit/process";
import { discover as discoverWorkspaces } from "@raypx-kit/devkit/workspaces";
import { isBrowserTestTask, prepareBrowserTask } from "./browser-tests.js";
import {
  runTasks as executeTasks,
  prepareTaskDirectories as prepareDirectories,
} from "@raypx-kit/devkit/tasks";
import { taskModel, taskPlan, taskRef, type TaskModel } from "./tasks/model.js";

/** Raypx conventions for the shared @raypx-kit/devkit checks. */
export const discover = (root: string) => discoverWorkspaces(root, { metadataKey: "raypx" });

function taskDirectories(member: TaskModel["members"][number]) {
  return [
    ...(member.native ? ["generated", "resources/bin", "build", ".mygo", "artifacts/browser"] : []),
    ...(member.scripts.build ? ["dist", ".output"] : []),
  ];
}
export function prepareTaskDirectories(model: TaskModel) {
  prepareDirectories(model, taskDirectories);
}

export async function runTasks(
  root: string,
  task: string,
  args: string[] = [],
  environment: Record<string, string> = {},
): Promise<void> {
  const separator = task.lastIndexOf("#"),
    name = separator < 0 ? task : task.slice(separator + 1);
  const browser = isBrowserTestTask(name) ? prepareBrowserTask(name, args, environment) : undefined;
  const model = taskModel(root, environment.RAYPX_VERIFY_TASKS);
  await executeTasks(model, task, browser?.args ?? args, {
    runtime: process.execPath,
    directories: taskDirectories,
    printPlan: () =>
      console.log(
        JSON.stringify({
          runner: "vp",
          tasks: taskPlan(model, [
            taskRef(separator < 0 ? model.rootName : task.slice(0, separator), name),
          ]),
        }),
      ),
    prepareEnvironment(invocation, plan) {
      const verb = invocation.name.split(":")[0];
      const development =
        ["dev", "build"].includes(verb!) ||
        plan.some(({ ref }) => /#task:(?:build(?::renderer)?|dev)$/.test(ref));
      const inherited = {
        ...(development ? developmentEnvironment(root) : process.env),
        ...(browser?.env ?? environment),
      };
      return {
        ...inherited,
        ...(browser
          ? {
              VITE_POSTHOG_PROJECT_TOKEN: "phc_e2e_synthetic",
              VITE_POSTHOG_HOST: "https://analytics.example.test",
            }
          : {}),
        VITE_APP_RELEASE: resolveRelease(
          root,
          inherited,
          ["verify", "test", "e2e"].includes(verb!)
            ? "verification"
            : verb === "dev"
              ? "development"
              : "build",
        ),
        RAYPX_CACHE_PLATFORM: `${process.platform}-${process.arch}-bun${process.versions.bun}`,
      };
    },
  });
}
