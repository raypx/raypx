import type { Kind, Target } from "@raypx-kit/devkit/workspaces";

export function workspaceInstructions({
  packageName,
  directory,
  kind,
  target,
  tests,
}: {
  packageName: string;
  directory: string;
  kind: Kind;
  target: Target;
  tests: boolean;
}): string {
  return `# ${packageName}

## Purpose

${target} ${kind}; describe its responsibility before adding behavior.

## Interface

Public exports are declared in package.json. vite.config.ts registers lightweight
VP task metadata; package scripts remain direct leaf commands.

## Constraints

Use public workspace entries and keep dependencies acyclic.

## Verification

Run bun run --cwd ${directory} check${tests ? " and test" : ""}.
`;
}
