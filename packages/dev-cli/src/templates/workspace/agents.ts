export function workspaceInstructions({
  packageName,
  directory,
  kind,
  target,
  tests,
}: {
  packageName: string;
  directory: string;
  kind: string;
  target: string;
  tests: boolean;
}): string {
  return `# ${packageName}

## Purpose

${target} ${kind}; describe its responsibility before adding behavior.

## Interface

Public exports are declared in package.json. Package scripts are the leaf commands
Turbo schedules; the root turbo.json owns their dependencies and cache keys.

## Constraints

Use public workspace entries and keep dependencies acyclic.
Place unit tests beside their source and name DOM suites *.component.test.ts(x).
Keep shared fixtures and integration/acceptance suites in tests/.

## Verification

Run bun run --cwd ${directory} check${tests ? " and test" : ""}.
`;
}
