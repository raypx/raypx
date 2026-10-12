import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";
import {
  runRepositoryCommands,
  type RepositoryProcessDependencies,
} from "../runtime/process-dependencies.js";

export const shadcnComponentsFile = "packages/ui/shadcn-components.json";

interface ShadcnComponentsManifest {
  components: unknown;
}

export async function readShadcnComponents(filePath: string): Promise<string[]> {
  const raw = await readFile(filePath, "utf8");
  const manifest = JSON.parse(raw) as ShadcnComponentsManifest;
  const components = manifest.components;

  if (
    !Array.isArray(components) ||
    components.length === 0 ||
    !components.every((component) => typeof component === "string" && component.length > 0)
  ) {
    throw new Error(`${filePath} must list at least one component under "components".`);
  }

  return components;
}

export interface ShadcnUpdateDependencies extends RepositoryProcessDependencies {
  readComponents(filePath: string): Promise<string[]>;
}

export async function runShadcnUpdate(dependencies: ShadcnUpdateDependencies): Promise<void> {
  const manifestPath = join(dependencies.repositoryRoot, shadcnComponentsFile);
  const components = await dependencies.readComponents(manifestPath);

  await runRepositoryCommands(
    dependencies,
    "shadcn.update",
    [
      [
        "bunx",
        "shadcn@latest",
        "add",
        ...components,
        "--yes",
        "--overwrite",
        "--cwd",
        "packages/ui",
      ],
    ],
    { components },
  );
}

const updateCommand = contextualCommand("shadcn update", "repository", {
  meta: {
    name: "update",
    description: `Refresh the components listed in ${shadcnComponentsFile} to their latest version`,
  },
  async run(context) {
    await runShadcnUpdate({ ...context, readComponents: readShadcnComponents });
  },
});

export const shadcnCommand = defineCommand({
  meta: { name: "shadcn", description: "Manage shadcn/ui components in packages/ui" },
  subCommands: { update: updateCommand },
});
