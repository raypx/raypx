import type { DiscoverOptions, Manifest, Workspace } from "../workspaces.js";

export interface TaskMember {
  name: string;
  path: string;
  scripts: Record<string, string>;
  dependencies: string[];
}
export type TaskInput = string | { auto: boolean } | { pattern: string; base: "workspace" };
export interface TaskCache {
  input: TaskInput[];
  output: string[];
  env: string[];
  untrackedEnv: string[];
}
export interface TaskDefinition {
  command: string;
  dependsOn: string[];
  cache: false | TaskCache;
}
export interface TaskModel<M extends TaskMember = TaskMember> {
  root: string;
  rootName: string;
  members: M[];
  definitions: Map<string, TaskDefinition>;
}
export interface TaskContext<M extends TaskMember> {
  root: string;
  rootName: string;
  manifest: Manifest;
  members: M[];
  dependencyClosure(member: M): M[];
}
/** Policies are explicitly supplied by the caller; inspected configuration never executes. */
export interface TaskPolicy<M extends TaskMember> {
  discovery?: DiscoverOptions;
  member(workspace: Workspace, member: TaskMember): M;
  define(member: M, name: string, context: TaskContext<M>): TaskDefinition;
  aggregateCommand: string;
  rootTasks?(context: TaskContext<M>): Record<string, TaskDefinition>;
}
export interface TaskInvocation {
  owner: string;
  name: string;
  filtered: boolean;
  forwarded: string[];
  options: string[];
  dry: boolean;
}
