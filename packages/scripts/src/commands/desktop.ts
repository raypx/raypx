import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";
import type { RepositoryProcessDependencies } from "../runtime/process-dependencies.js";
import { prepareDesktopRunner } from "../desktop/prepare.js";

export async function runDesktopBuild(dependencies: RepositoryProcessDependencies): Promise<void> {
  dependencies.log("info", "desktop.build.started");
  // Tauri's DMG bundler uses CI to skip Finder AppleScript automation. That
  // keeps the repository build deterministic on machines without Automation
  // permission while still producing the .app and DMG bundles.
  const desktopBuildEnv = { ...dependencies.processEnv, CI: "true" };
  await dependencies.runCommand(["bun", "run", "--cwd", "apps/desktop", "tauri", "build"], {
    cwd: dependencies.repositoryRoot,
    env: desktopBuildEnv,
  });
  dependencies.log("info", "desktop.build.completed");
}

const buildDesktopCommand = contextualCommand("desktop build", "repository", {
  meta: { name: "build", description: "Build the Tauri desktop application" },
  async run(context) {
    await runDesktopBuild(context);
  },
});

const prepareDesktopCommand = contextualCommand("desktop prepare", "repository", {
  meta: {
    name: "prepare",
    description: "Bundle the pinned Node runtime and Pi runner for Desktop",
  },
  async run(context) {
    await prepareDesktopRunner(context.repositoryRoot, (event) => context.log("info", event));
  },
});

export const desktopCommand = defineCommand({
  meta: { name: "desktop", description: "Manage the Voidmix desktop application" },
  subCommands: { build: buildDesktopCommand, prepare: prepareDesktopCommand },
});
