# @raypx/tooling

## Purpose

Importable repository surface: VP task registration, application build helpers,
browser test settings, the Desktop browser preview server and performance runs.
`@raypx/dev-cli` owns every `raypx-dev` command; this package never references its
source paths except as command strings.

## Interface

| Entry                                                                           | Consumers                            |
| ------------------------------------------------------------------------------- | ------------------------------------ |
| `./tasks`                                                                       | every workspace `vite.config.ts`     |
| `./tasks/model`, `./tasks/lifecycle`                                            | Dev CLI verification and scaffolding |
| `./build/nitro`, `./build/deployment`, `./build/analytics`, `./build/start-env` | API, Web, Desktop, Railway, Dev CLI  |
| `./build/cli`, `./build/release`                                                | CLI and Desktop packaging, Dev CLI   |
| `./browser-tests`, `./browser-server`                                           | Dev CLI, E2E, Desktop performance    |
| `./performance`                                                                 | CLI and Desktop performance runs     |

- `./build/nitro` supplies shared Nitro Bun build options to API and Web configs.
- `./build/deployment` owns service ports, health paths and API ingress routes.
  Policy checks static Docker, Compose and Caddy adapters plus API environment
  forwarding without importing application runtime or loading environment files.

`./tasks` exposes Node-compatible, lightweight task configuration. Its model derives
all members and scripts from manifests, registers private `task:*` definitions and
explicit dependencies; VP alone schedules them. VP invokes Bun package scripts
directly. Aggregates declare dependencies with an empty command. The scoped
argument adapter is used when the launcher sends different arguments to individual
tasks in the same graph. Task definitions inherit the environment with `untrackedEnv`;
outcome-affecting fields and per-task argument keys participate in fingerprints.
`raypx.uncachedTasks` opts specific scripts out. VP caches Tooling's `test` and
`test:unit` tasks. The focused `test:integration` task runs on demand.
Platform/toolchain identity is also part of each command. Native packaging stays
outside VP's filesystem tracer; Go owns its native compilation cache.
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
authored source folders with the same names remain inputs. Root policy/locale tasks use
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
`./browser-server` serves only compiled Desktop client assets on loopback with
HTML deep-link fallback; never run Vite configuration or simulate backend/Native IPC there.

`./performance` validates prepared artifacts, scrubs credentials, preserves Strobe ownership, and exports check/A/A/A/B evidence. Performance leaves are uncached and have no CLI build prerequisite. Missing process attribution is uncertain, never a passing measurement.

## Constraints

No product runtime imports this package. Do not import Dev CLI. Every entry keeps
a consumer in another workspace. The shared happy-dom setup lives in
`tests/setup/dom.ts`; root `test.config.ts` references it by path.

## Verification

Run `bun run --cwd packages/tooling test` and `check`, then `bun run policy`.
