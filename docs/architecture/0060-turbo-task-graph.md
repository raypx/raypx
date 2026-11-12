# ADR 0060: Turbo task graph

Date: 2026-11-12

Status: Accepted. Supersedes the VP task graph and `@raypx/task-graph` in
[ADR 0057](0057-repository-automation-workspaces.md).

## Context

VP registered a private `task:*` definition for every package script through a
`vite.config.ts` in each workspace. `@raypx/task-graph` derived those definitions and
their cache inputs in code: about 460 lines of exclusion lists, per-workspace branches
and argument forwarding, on top of VP's file-access tracing. Every workspace depended
on that package, so editing a cache rule invalidated every type check. Public scripts
re-entered the graph and delegated to private runner scripts through
`raypx.taskScripts`.

Measured on one machine over the same 73 check and test tasks:

| Scenario                         | VP                        | Turbo                    |
| -------------------------------- | ------------------------- | ------------------------ |
| Cold run                         | 2m56s                     | 2m57s                    |
| Rerun without changes            | 73/73 restored, about 11s | 73/73 restored, under 1s |
| Source edit in a leaf library    | 4 tasks re-executed       | 6 tasks re-executed      |
| Revert that edit                 | re-executed again         | restored                 |
| Edit to the shared `test.config` | 35 suites re-executed     | none until declared      |

Tracing is more precise per edit. Turbo's content-addressed entries survive reverts and
branch switches, its per-package lockfile hashing keeps a dependency bump from
invalidating unrelated workspaces, and its no-op overhead is negligible.

## Decision

Turbo owns the task graph and cache; Vite+ remains the build, test, lint and format
tool that leaf scripts call.

- Root `turbo.json` declares each graph task, its dependencies, inputs, outputs and
  environment keys. A workspace adds `turbo.json` only for inputs or prerequisites
  outside those defaults.
- `transit` carries a dependency's sources into its dependents' hashes and excludes
  its tests, suites and documentation. Root files every suite loads are global
  dependencies.
- Package scripts are leaf commands. `raypx.taskScripts`, the private `_` runner
  scripts and the task-only `vite.config.ts` files are removed.
- `raypx-dev` is the launcher: it supplies platform identity, the development
  environment and a default concurrency of three, and reads Turbo's run summary for
  verification reports. Browser acceptance builds through Turbo and then starts
  Playwright itself.
- Tasks inherit the environment (`envMode: loose`), as before.
- `@raypx/task-graph` is deleted. Workspace discovery and browser test planning move
  into Dev CLI.

## Consequences

- Cache rules are data in `turbo.json` rather than code every workspace depends on.
- A direct workspace script no longer runs prerequisites. Root commands and
  `raypx-dev tasks <package>#<task>` do.
- Invalidation is package-scoped: a change re-runs every dependent task, including
  suites that never read the changed file.
- A root file that affects tasks must be listed in `globalDependencies`; Turbo does not
  discover it.
- When `RAYPX_CLI_PAYLOAD` is set the CLI build exits without compiling instead of
  failing, because artifact consumers now reach it as a graph prerequisite.
- CI caches `.turbo/cache`. No remote cache is configured.
