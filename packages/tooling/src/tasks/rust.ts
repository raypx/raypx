import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TaskDefinition, TaskMember } from "./model.js";
import { taskRef } from "./names.js";

/** Cargo owns incremental state; VP only orders this uncached pipeline. */
export function rustTasks(
  root: string,
  rootName: string,
  _members: TaskMember[],
  definitions: Map<string, TaskDefinition>,
  selection?: string,
): string[] {
  if (!existsSync(join(root, "Cargo.toml"))) return [];
  const packages: unknown = selection ? JSON.parse(selection) : [];
  if (
    !Array.isArray(packages) ||
    packages.some((name) => typeof name !== "string" || !/^[a-zA-Z0-9_-]+$/.test(name))
  )
    throw new Error("Invalid Cargo package selection");
  const scope = packages.length
    ? packages.map((name) => `--package ${name}`).join(" ")
    : "--workspace";
  let previous: string | undefined;
  for (const [name, command] of Object.entries({
    format: "cargo fmt --all -- --check",
    lint: `cargo clippy ${scope} --all-targets --all-features --locked -- -D warnings`,
    test: `cargo test ${scope} --all-features --locked`,
  })) {
    const ref = taskRef(rootName, `verify:rust:${name}`);
    definitions.set(ref, {
      command,
      cache: false,
      dependsOn: previous ? [previous] : [],
    });
    previous = ref;
  }
  return [previous!];
}
