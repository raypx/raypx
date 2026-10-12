# ADR-0002: Vite+ as the only task orchestrator

## Status

Superseded by [ADR-0018](0018-turbo-task-orchestration.md)

## Context

Vite+ owns the task graph: `vp run -r <task>` drives checks, tests, and builds
across workspaces, with caching and filtering. Vite+ also ships capabilities that
are commonly added as separate tools in a monorepo:

- `vp lint` (Oxlint) and `vp fmt` (Oxfmt), already configured in the root
  `vite.config.ts`;
- `vp staged`, a staged-file runner;
- `vp hooks enable`, a git hook dispatcher that sets a local `core.hooksPath`.

For a period, the lint and format configuration existed but no script or CI step
invoked it, so the repository looked as though it had no linter. The obvious
reading of that gap was "add ESLint, Prettier, and Lefthook". Doing so would have
installed a second linter, a second formatter, and a second hook manager beside
working implementations of all three.

## Decision

Vite+ is the only task orchestrator, linter, formatter, and hook manager. The
repository does not add Turborepo, Nx, ESLint, Prettier, Biome, Lefthook, or
Husky.

Capabilities are exposed through root scripts so the repository-local versions
run: `lint`, `format`, `format:fix`, `check`, `test`, `build`, `policy`,
`verify`.

Procedural automation that needs to understand the repository or the database
lives in `@voidmix/scripts` (the `vmx` CLI). That is a different concern from
orchestration, so it is not an exception to this decision.

**Amended.** This originally said such automation is invoked _by_ a Vite+ task,
not alongside it, and the root scripts routed through
`vp run @voidmix/scripts#<task>`. The clause bought nothing it claimed to:
`vite.config.ts` defines no `run.tasks`, so those were plain `package.json`
scripts that Vite+ neither cached nor ordered — the extra hop added a process and
a log frame. It also left the rule half-followed, with `doctor`, `clean`, and
`db:studio` calling the workspace directly while nine siblings did not.

Root scripts now invoke the CLI directly (`vmx policy --fix`), one style for all
twelve. Vite+ remains the only orchestrator: `vmx` orders nothing across
workspaces, and anything that does — `check`, `test`, `build` — still goes through
`vp run`. Should one of these commands ever need a place in the task graph, define
it as a real Vite+ task rather than reinstating the hop.

## Consequences

- `check` keeps meaning `vp run -r check` — per-workspace `tsc --noEmit`. It is
  deliberately not repointed at `vp check`, which additionally runs fmt and lint
  and resolves a root-level typecheck; those are separate scripts.
- Formatter coverage includes markdown, JSON, CSS, and TOML, so generated output
  must be excluded explicitly in `.prettierignore` rather than by convention.
- The project-owned `.vite-hooks/pre-commit` script is committed, while the
  generated `.vite-hooks/_` dispatcher stays local. The pre-commit pass remains
  opt-in per developer via `vp hooks enable`, so CI is the only guaranteed gate.
- A dependency on a second orchestrator, linter, formatter, or hook manager
  appearing in a manifest means this decision was bypassed rather than revisited.

## Follow-up

Revisit if Vite+ drops one of these capabilities, or if its Oxlint or Oxfmt
version falls far enough behind that a needed rule or option is unavailable. Any
replacement should displace the Vite+ capability rather than run beside it.
