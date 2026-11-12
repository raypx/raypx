import { resolveRelease } from "./build/release.js";
import { developmentEnvironment } from "@raypx/devkit/process";
import { run } from "@raypx/runtime-node/process";
import { discover as discoverWorkspaces } from "@raypx/devkit/workspaces";
import { browserTestArguments, isBrowserTestTask, prepareBrowserTask } from "./browser-tests.js";
import { join } from "node:path";
import {
  runTasks as executeTasks,
  prepareTaskDirectories as prepareDirectories,
} from "@raypx/devkit/tasks";
import { taskModel, taskPlan, taskRef, type TaskModel } from "./tasks/model.js";

/** Raypx conventions for the shared @raypx/devkit checks. */
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
  const model = taskModel(root, environment.RAYPX_VERIFY_TASKS);
  const owner =
    separator < 0
      ? undefined
      : model.members.find((member) => member.name === task.slice(0, separator));
  if (isBrowserTestTask(name) && owner?.browserProject) {
    if (environment.RAYPX_E2E_SURFACE && environment.RAYPX_E2E_SURFACE !== owner.browserProject)
      throw new Error("Browser surface conflicts with the selected package");
    environment = { ...environment, RAYPX_E2E_SURFACE: owner.browserProject };
  }
  const browser = isBrowserTestTask(name) ? prepareBrowserTask(name, args, environment) : undefined;
  if (browser) {
    const surface = browser.env.RAYPX_E2E_SURFACE;
    if (!owner?.browserProject && surface !== "all")
      task = `${separator < 0 ? "" : `${task.slice(0, separator)}#`}e2e:${surface}`;
    if (browserTestArguments([], browser.env).includes("--list")) {
      if (browser.args.includes("--dry-run"))
        console.log(JSON.stringify({ runner: "playwright", tasks: [] }));
      else
        await run(
          process.execPath,
          [join(root, "packages/tooling/src/cli.ts"), "browser:run"],
          root,
          { ...process.env, ...browser.env },
        );
      return;
    }
  }
  await executeTasks(model, task, browser?.args ?? args, {
    runtime: process.execPath,
    directories: taskDirectories,
    printPlan: () =>
      console.log(
        JSON.stringify({
          runner: "vp",
          tasks: taskPlan(model, [
            taskRef(
              task.includes("#") ? task.slice(0, task.lastIndexOf("#")) : model.rootName,
              task.slice(task.lastIndexOf("#") + 1),
            ),
          ]),
        }),
      ),
    prepareEnvironment(invocation, plan) {
      const verb = invocation.name.split(":")[0];
      const development =
        ["dev", "build"].includes(verb!) ||
        plan.some(({ ref }) => /#task:(?:build(?::renderer|:e2e)?|dev)$/.test(ref));
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
