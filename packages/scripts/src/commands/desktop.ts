import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";
import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";

export async function runDesktopBuild(dependencies: RepositoryProcessDependencies): Promise<void> {
  dependencies.log("info", "desktop.build.started");
  const desktopBuildEnv = { ...dependencies.processEnv, CI: "true" };
  await dependencies.runCommand(["bun", "run", "build:desktop"], {
    cwd: dependencies.repositoryRoot,
    env: desktopBuildEnv,
  });
  await dependencies.runCommand(["bun", "run", "--cwd", "apps/desktop", "native:build"], {
    cwd: dependencies.repositoryRoot,
    env: desktopBuildEnv,
  });
  dependencies.log("info", "desktop.build.completed");
}

const buildDesktopCommand = contextualCommand("desktop build", "repository", {
  meta: { name: "build", description: "Build the Electrobun desktop application" },
  async run(context) {
    await runDesktopBuild(context);
  },
});

export const desktopCommand = defineCommand({
  meta: { name: "desktop", description: "Manage the Raypx desktop application" },
  subCommands: { build: buildDesktopCommand },
});
