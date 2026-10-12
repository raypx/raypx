import type { DatabaseScriptsEnvironment, ScriptsEnvironment } from "../env.js";
import { getDatabaseScriptsEnv, getScriptsEnv } from "../env.js";
import {
  resolveProcessEnvironment,
  type ProcessEnvironment,
  type ResolveProcessEnvironmentOptions,
} from "./env.js";
import { createScriptsLogger, type ScriptsLog } from "./logger.js";
import { repositoryRoot } from "./repository.js";

export type CommandContextPolicy = "database" | "process" | "repository";

export type CommandContextOptions = ResolveProcessEnvironmentOptions;

export interface CommandContext<Environment extends ScriptsEnvironment> {
  environment: Environment;
  log: ScriptsLog;
  processEnv: ProcessEnvironment;
  repositoryRoot: string;
}

export type CommandContextForPolicy<Policy extends CommandContextPolicy> = CommandContext<
  Policy extends "database" ? DatabaseScriptsEnvironment : ScriptsEnvironment
>;

function createContext<Environment extends ScriptsEnvironment>(
  processEnv: ProcessEnvironment,
  environment: Environment,
  root: string,
): CommandContext<Environment> {
  return {
    environment,
    log: createScriptsLogger(environment, processEnv),
    processEnv,
    repositoryRoot: root,
  };
}

export function createCommandContext<Policy extends CommandContextPolicy>(
  policy: Policy,
  options: CommandContextOptions = {},
): CommandContextForPolicy<Policy> {
  const source = policy === "process" ? "process" : "repository";
  const processEnv = resolveProcessEnvironment(source, options);
  const environment =
    policy === "database" ? getDatabaseScriptsEnv(processEnv) : getScriptsEnv(processEnv);
  return createContext(
    processEnv,
    environment,
    options.repositoryRoot ?? repositoryRoot,
  ) as CommandContextForPolicy<Policy>;
}
