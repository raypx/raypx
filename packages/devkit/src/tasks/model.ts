import { readFileSync } from "node:fs";
import { join } from "node:path";
import { discover, type Manifest } from "../workspaces.js";
import type { TaskContext, TaskDefinition, TaskMember, TaskModel, TaskPolicy } from "./types.js";

export const taskName = (name: string) => `task:${name}`;
export const taskRef = (owner: string, name: string) => `${owner}#${taskName(name)}`;

export function createTaskModel<M extends TaskMember>(
  root: string,
  policy: TaskPolicy<M>,
  selection?: string,
): TaskModel<M> {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;
  const index = discover(root, policy.discovery);
  if (index.findings.length) throw new Error(index.findings.join("\n"));
  const members = index.workspaces.map((workspace) =>
    policy.member(workspace, {
      name: workspace.manifest.name,
      path: workspace.path,
      scripts: workspace.manifest.scripts ?? {},
      dependencies: [
        ...new Set([
          ...Object.keys(workspace.manifest.dependencies ?? {}),
          ...Object.keys(workspace.manifest.devDependencies ?? {}),
        ]),
      ],
    }),
  );
  const byName = new Map(members.map((member) => [member.name, member]));
  const context: TaskContext<M> = {
    root,
    rootName: manifest.name,
    manifest,
    members,
    dependencyClosure(member) {
      const found = new Set<M>();
      function visit(current: M) {
        if (found.has(current)) return;
        found.add(current);
        for (const name of current.dependencies) {
          const dependency = byName.get(name);
          if (dependency) visit(dependency);
        }
      }
      visit(member);
      return [...found];
    },
  };
  const definitions = new Map<string, TaskDefinition>();
  for (const member of members)
    for (const name of Object.keys(member.scripts))
      definitions.set(taskRef(member.name, name), policy.define(member, name, context));
  const aggregate = (dependsOn: string[]): TaskDefinition => ({
    command: policy.aggregateCommand,
    dependsOn,
    cache: false,
  });
  for (const name of new Set(members.flatMap((member) => Object.keys(member.scripts))))
    definitions.set(
      taskRef(manifest.name, name),
      aggregate(
        members
          .filter((member) => member.scripts[name])
          .map((member) => taskRef(member.name, name)),
      ),
    );
  for (const [name, definition] of Object.entries(policy.rootTasks?.(context) ?? {}))
    definitions.set(taskRef(manifest.name, name), definition);
  const selected: unknown = selection ? JSON.parse(selection) : [];
  if (
    !Array.isArray(selected) ||
    selected.some(
      (ref) =>
        typeof ref !== "string" ||
        !definitions.has(ref) ||
        ref === taskRef(manifest.name, "verify:run"),
    )
  )
    throw new Error("Invalid verification task selection");
  definitions.set(
    taskRef(manifest.name, "verify:run"),
    aggregate([...new Set(selected as string[])]),
  );
  return { root, rootName: manifest.name, members, definitions };
}

export function taskPlan<M extends TaskMember>(
  model: TaskModel<M>,
  references: string[],
  order: "dependencies-first" | "task-first" = "dependencies-first",
) {
  const found = new Map<string, TaskDefinition>();
  const visiting = new Set<string>();
  const complete = new Set<string>();
  function visit(ref: string) {
    if (visiting.has(ref)) throw new Error(`Cyclic VP task dependency: ${ref}`);
    if (complete.has(ref)) return;
    const definition = model.definitions.get(ref);
    if (!definition) throw new Error(`Unknown VP task: ${ref}`);
    visiting.add(ref);
    if (order === "task-first") found.set(ref, definition);
    for (const dependency of definition.dependsOn) visit(dependency);
    if (order === "dependencies-first") found.set(ref, definition);
    visiting.delete(ref);
    complete.add(ref);
  }
  references.forEach(visit);
  return [...found].map(([ref, definition]) => ({ ref, ...definition }));
}
