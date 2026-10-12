# Coding Agents

Voidmix keeps one shared instruction set. The root [`AGENTS.md`](../../AGENTS.md)
holds repository-wide constraints, every workspace has its own `AGENTS.md` for
local constraints, and [`CLAUDE.md`](../../CLAUDE.md) is a one-line import of the
root file so Codex and Claude Code read the same rules. Start either agent from
the repository root so it discovers the root rules and uses consistent paths.

This document is an execution checklist, not a replacement for those files. When
it disagrees with the nearest `AGENTS.md`, the `AGENTS.md` wins.

## The three layers

| Layer       | Answers               | Where                                   |
| ----------- | --------------------- | --------------------------------------- |
| `AGENTS.md` | what is forbidden     | repository root and every workspace     |
| `docs/`     | why the seam is there | this directory and `docs/architecture/` |
| `skills/`   | how to do the task    | `skills/voidmix-infra/`                 |

A rule belongs in exactly one of them. `skills/` never restates an `AGENTS.md`
rule, and `AGENTS.md` never explains its own reasoning at length.

## Nested AGENTS.md scoping

Rules in `packages/db/AGENTS.md` apply to changes under `packages/db` and nowhere
else. The nearest file wins for local questions, and the root file remains in
force for everything that spans workspaces — dependency direction, generated-file
handling, logging and audit separation.

A rule no single workspace can own belongs in the root file. A rule that only
makes sense inside one workspace belongs in that workspace's file, so it stays
out of context when you are working elsewhere. Each workspace file is capped at
200 lines; past that, the detail belongs in `docs/`.

## Read order

Read the smallest useful set before editing:

1. Root [`AGENTS.md`](../../AGENTS.md).
2. The target workspace's `AGENTS.md`. It names that workspace's exports,
   invariants, and verification commands.
3. [`docs/README.md`](../README.md), then the focused architecture or development
   document for the area being changed.
4. [Decision records](../architecture/decisions/README.md) when a change would
   relax or reverse a stated constraint.

Then, by task:

- Adding or changing an API procedure:
  [oRPC procedures](../../skills/voidmix-infra/references/orpc-procedures.md).
- Tests or the verification loop: [Testing and verification](./testing.md).
- Commands, presets, or the linter: [Toolchain](../architecture/tooling.md).
- Local setup and services: [Getting started](./getting-started.md).

## Default decisions when uncertain

`AGENTS.md` states the constraints; these are the tie-breakers it does not decide.
Above all, prefer the existing local pattern over a new abstraction.

- Put new code in the workspace that already owns the behavior; do not create a
  package. New shared packages need a stable interface and two real consumers.
- Extend the owning contracts domain module and wire its procedure into the
  explicit `packages/contracts/src/index.ts` tree; see ADR-0013.
- Keep dates as native `Date` end to end. Never serialize to ISO strings.
- Apply the matching permission middleware to protected Admin procedures and
  the principal middleware to authenticated canonical routes. Application
  commands enforce project capabilities; cover rejected callers in tests.
- Construct audit events in Core and append them in Application through the
  administration transaction port, never from a handler. Keep operational logs
  separate. See ADR-0014.
- Prefer a narrower `AGENTS.md` over a broader one: if a rule only holds inside
  one workspace, it belongs to that workspace's file.
- When a choice would relax a stated constraint, stop and write an
  [ADR](../architecture/decisions/README.md) instead of deciding locally.

Where a file goes is a separate question — see
[file structure](./file-structure.md).

## Verification

[Testing and verification](./testing.md) holds the command list. Run the
workspace's own narrowest check first, then broaden by risk.

`bun run policy` is the one that catches structural mistakes: a workspace
`AGENTS.md` missing a section or over the line cap, a workspace absent from a
listing, a directory that is empty or lacks a `package.json`, a dangling
documentation link, a document unreachable from `docs/README.md`, or broken skill
wiring. Every finding prints a `Fix:` line, and it runs immediately after i18n inside
`bun run verify` so a structural failure never waits for a build.

Report outcomes honestly. If a check fails, say so with its output; if a step was
skipped, say that.

## Skills

`skills/voidmix-infra/` is the project skill: task-scoped procedures and the
specific ways this repository bites. It is the canonical copy;
`.claude/skills/voidmix-infra` is a symlink to it, and `bun run policy` verifies
the symlink's literal target text so it keeps working in a fresh clone. Never
maintain a second copy under a discovery directory.

Add a playbook under `references/` when a task has a fixed edit order spanning
more than one workspace. Keep it procedural — the file order, the registration
points, the failure modes — and leave rules to `AGENTS.md`.

### Vendored skills

Third-party skills are installed under `.agents/skills/` and symlinked into
`skills/` and `.claude/skills/`. `skills-lock.json` records each one's source and
a content hash; `bun run skills:update` refreshes them and `bun run policy`
verifies that every locked skill is installed and linked with the exact relative
target text. `.prettierignore` excludes `.agents/` so the formatter cannot rewrite
upstream bytes and invalidate the hash.

**Never hand-edit a vendored skill.** An update would overwrite the edit
silently, leaving a fork that still looks upstream. Corrections go in
`skills/voidmix-infra/references/`, which is ours.

Vendored skills know their framework, not this repository. They never override an
`AGENTS.md` rule.

Currently adopted:

| Skill                            | Source                                 | Why                                                                            |
| -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| `shadcn`                         | `shadcn/ui`                            | documents the Base UI versus Radix API split and the configured icon library   |
| `hono`                           | `yusukebe/hono-skill`                  | one file, matches the API's middleware and routing layer                       |
| `postgres-drizzle`               | `ccheney/robust-skills`                | schema, query, migration, and index guidance for `packages/db`                 |
| `tanstack-router-best-practices` | `deckardger/tanstack-agent-skills`     | the repository has no loader or route-guard precedent                          |
| `tanstack-start-best-practices`  | `deckardger/tanstack-agent-skills`     | the repository has no server-function precedent                                |
| `better-auth-best-practices`     | `better-auth/skills`                   | Better Auth configuration, sessions, adapters, plugins, and security           |
| `tauri-v2`                       | `nodnarbnitram/claude-code-extensions` | Tauri v2 IPC, capabilities, Rust commands, and desktop deployment              |
| `vercel-react-best-practices`    | `vercel-labs/agent-skills`             | React performance, bundle size, rendering, and data-fetching guidance          |
| `vite`                           | `antfu/skills`                         | Vite configuration, plugin, SSR, and Rolldown guidance for the Vite+ toolchain |

Read [TanStack corrections](../../skills/voidmix-infra/references/tanstack.md)
before acting on the two TanStack skills. They over-promise their rule indexes,
disagree with the installed API on the server-function validator name, and their
session guidance targets a stack this repository does not use.

Deliberately **not** adopted. Recording these is the more useful half, because it
stops the same candidates being re-evaluated every few months:

- `turborepo` — not yet adopted. Turbo now owns the task graph
  ([ADR-0018](../architecture/decisions/0018-turbo-task-orchestration.md)); review
  the candidate skill against the pinned tool before installing it.
- `opentui` — a terminal UI framework; `apps/desktop` is a Tauri webview.
- `tanstack-query-best-practices` and `tanstack-integration-best-practices` — not
  yet adopted. Query is now used for ordinary resource data; review candidates
  against the installed Router integration and ClientSession ownership first.
- `migrate-radix-to-base` — a migration this repository never has to perform, and
  the `shadcn` skill already carries the API differences.
- `impeccable`, `ui-ux-pro-max`, `frontend-design` — overlapping design skills.
  Adopting several gives competing always-on triggers, and `impeccable` also wants
  to install agent hooks.
- The other eight skills in `ccheney/robust-skills` (Slack, Teams, Mermaid, and
  general architecture) — unrelated to this repository's surfaces.

Before adopting anything new, read it in full, confirm it has a maintainer and a
stated applicable version, and record it above with the reason. Never let CI
update skills automatically: the lockfile hash is the only thing between an
upstream edit and an instruction an agent will follow.

## Local configuration

Keep permissions, hooks containing secrets, API keys, and personal preferences
out of the repository. No committed model selection or machine-specific agent
configuration is required. `.gitignore` denies everything under `.claude/` except
the skill symlinks, so per-user agent state stays local by default. Commit
repository-wide agent settings only when they are deterministic, safe for every
contributor, and cannot be expressed in `AGENTS.md`.

Do not add instruction copies for other agent harnesses. A hand-maintained
duplicate of `AGENTS.md` drifts silently because nothing checks it; one file plus
a one-line import is the whole design.
