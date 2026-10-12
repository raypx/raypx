import { config as loadDotenvx } from "@dotenvx/dotenvx";
import { join } from "node:path";

import { repositoryRoot } from "./repository.js";

export const REPOSITORY_ENV_KEY = "VOIDMIX_REPOSITORY_ENV";

export type ProcessEnvironment = Record<string, string>;
export type ProcessEnvironmentSource = "process" | "repository";

export interface ResolveProcessEnvironmentOptions {
  processEnv?: NodeJS.ProcessEnv;
  repositoryRoot?: string;
}

function copyEnvironment(values: NodeJS.ProcessEnv): ProcessEnvironment {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function loadEnvironmentFile(path: string, processEnv: ProcessEnvironment): void {
  const result = loadDotenvx({
    path,
    processEnv,
    quiet: true,
    ignore: ["MISSING_ENV_FILE"],
  });
  if (result.error) throw result.error;
}

export function resolveProcessEnvironment(
  source: ProcessEnvironmentSource,
  options: ResolveProcessEnvironmentOptions = {},
): ProcessEnvironment {
  const environment = copyEnvironment(options.processEnv ?? process.env);
  if (source === "process") return environment;

  const root = options.repositoryRoot ?? repositoryRoot;
  if (environment[REPOSITORY_ENV_KEY] === root) return environment;

  loadEnvironmentFile(join(root, ".env.local"), environment);
  loadEnvironmentFile(join(root, ".env"), environment);
  environment[REPOSITORY_ENV_KEY] = root;
  return environment;
}
