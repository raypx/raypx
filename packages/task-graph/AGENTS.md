# @raypx/task-graph

## Purpose

VP task registration for every workspace: manifest discovery, the Raypx task graph,
cache inputs and outputs, platform identity, argument forwarding and task leaves.
Every `vite.config.ts` imports it, so every type check fingerprints it: keep it small,
stable and free of build, policy or command code.

## Interface

| Entry             | Purpose                                                 | Consumers       |
| ----------------- | ------------------------------------------------------- | --------------- |
| `.`               | `workspaceTaskConfig(import.meta.url)`                  | every workspace |
| `./model`         | `taskModel`, `taskPlan`, `taskRef`, `TaskModel`         | Dev CLI         |
| `./lifecycle`     | CLI task lifecycle inputs from the API relay fixture    | Dev CLI         |
| `./browser-tests` | Browser task names, surfaces and Playwright arguments   | Dev CLI         |
| `./workspaces`    | Discovery, metadata, export and import resolution       | Dev CLI         |
| `./core`          | Generic graph, arguments, VP launch, leaf and snapshots | Dev CLI         |

`src/leaf.ts` forwards per-task arguments when one VP run gives workspace scripts
different arguments. `src/process.ts` is the internal inherited-output runner.

## Constraints

- No internal dependencies, including devDependencies: every workspace depends on
  this package. The tsconfig inlines the strict preset and `vite.config.ts` registers
  its own tasks from source.
- Only `vite.config.ts` files and Dev CLI import it; product runtime code never does.
- Derive members and scripts from manifests; never execute repository configuration.
- Type checks fingerprint the member and every dependency with package exports,
  excluding dependencies' tests, `*.test.*`/`*.spec.*` files and VP/Vitest configs
  unless package exports point into `tests/`. `privateTestFile` applies the same rule
  to the verification planner.
- Platform/toolchain identity is part of each command; per-task argument keys
  participate in fingerprints.

## Details

The root entry exposes Node-compatible, lightweight task configuration. Its model derives
all members and scripts from manifests, registers private `task:*` definitions and
explicit dependencies; VP alone schedules them. VP invokes Bun package scripts
directly. Aggregates declare dependencies with an empty command. The scoped
argument adapter is used when the launcher sends different arguments to individual
tasks in the same graph. Task definitions inherit the environment with `untrackedEnv`;
outcome-affecting fields and per-task argument keys participate in fingerprints.
Workspace `check`, build and default/unit/component test tasks are cacheable.
Dedicated integration and browser tasks always execute. Platform/toolchain identity
is part of each command. Native packaging stays outside VP's filesystem tracer;
Go owns its native compilation cache.
CLI builds exclude the verified Herdr download cache from task inputs; manifest
pins and the complete sealed `dist` determine reuse on fresh runners.
The launcher creates ignored artifact/native directories before tracing:
directory enumeration can otherwise invalidate JS tasks when those paths first appear.
Type checks explicitly fingerprint source/config files in the transitive workspace
dependency closure, retaining dependency declarations under build outputs; Bun's
native typechecker reads are not fully covered by automatic tracing on Linux.
The closure counts only dependencies with package exports: a bin-only workspace
cannot reach another workspace's type check. VP still tracks actual reads.
Workspace coverage and validation/browser reports are excluded across that closure;
authored source folders with the same names remain inputs. The root `types` task
checks every workspace's `vite.config.ts` and `vitest.config.ts`, the root config and
`deploy/*.ts` through the root Node tsconfig, because a universal or browser preset
lacks Node types. Lint keeps type-aware rules but no compiler pass of its own: these
workspace and root type checks are the only TypeScript diagnostics. Root policy/locale tasks use
VP caching with explicit discovery/source/catalog/config inputs plus automatic tracing.
Policy/locales run in the same VP graph as source tasks and restore timing evidence
with their cached outputs. Verification records per-check execution times (zero on a
cache hit), format/lint wall times and VP graph wall time including runner overhead.
Timing evidence never controls cache reuse. Failed checks never publish success.

`src/browser-tests.ts` prepares browser selectors and Playwright arguments.
E2E owns the Playwright configuration and worker defaults. Browser launchers
select synthetic analytics for every mode; live acceptance stays separate.
Browser argv travels through `RAYPX_E2E_ARGS` to the uncached `browser:run` leaf,
never dependency passthrough: test flags must not invalidate build/check dependencies.
Applications declare `raypx.browserTestProject` and delegate `e2e` to `_e2e`.
The root runs one shared Playwright process; local/package entries run one application.
Native `--project=web|desktop` selectors resolve before graph construction. `--list`
bypasses builds and servers. Web `build:e2e` compiles the production SSR artifact
without the normal build's type-check prerequisite; daily verification keeps checks.

## Verification

```bash
bun run --cwd packages/task-graph check
bun run --cwd packages/task-graph test
```
