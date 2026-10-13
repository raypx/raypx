# Raypx Documentation

This directory is the source of truth for architecture, development workflows,
deployment boundaries, and coding-agent guidance.

## Architecture

- [Cloud platform](./architecture/cloud-platform.md) — Web-first Search/Computer,
  durable execution, shared business UI and SaaS foundations.

- [Architecture overview](./architecture/README.md) — system shape, workspace
  map, dependency direction, and design rules.
- [Historical Agent workbench](./architecture/agent-workbench.md) — the earlier
  local-first design; cloud execution order is defined by ADR-0016.
- [Domain glossary](../CONTEXT.md) — shared terms for workspaces, projects,
  assets, sync, Agent runs, and boundary layers.
- [Domain services and client state](./architecture/domain-services.md) — ownership,
  state lifetimes, compatibility and verification of the boundary migration.
- [Applications](./architecture/applications.md) — Web, Desktop, API,
  and Storybook: what each is for, how it is built, and how it is deployed.
- [Shared packages](./architecture/packages.md) — contracts, client, domain,
  auth, i18n, mail, shared foundation, DB, UI, scripts, and TypeScript presets.
- [Product design](./architecture/design.md) — brand posture, cross-surface
  intensity, visual vocabulary, and accessibility rules.
- [Raypx delivery goal](./architecture/raypx-delivery-goal.md) — current cloud
  product and lightweight Desktop acceptance target.
- [Historical Project Studio migration](./architecture/project-studio.md) — the
  earlier project-first migration, superseded by the cloud product decisions.
- [Account-first canonical architecture](./architecture/account-first-v2.md) —
  the V2-only API, project ownership, permissions, Agent runs, and Organization
  reservation.
- [Toolchain](./architecture/tooling.md) — Bun catalogs, Vite+, TypeScript,
  shadcn/Base UI, and repository automation; Worker executable packaging follows
  [ADR-0023](./architecture/decisions/0023-worker-vite-nitro-artifact.md) and its
  [single-entry refinement](./architecture/decisions/0025-worker-single-entry-execution.md).
- [Worker execution decision](./architecture/decisions/0025-worker-single-entry-execution.md)
  — one executable, isolated task processes and Host-owned Run deadlines.
- [Direct Run queue decision](./architecture/decisions/0026-direct-run-queue-and-retire-task-notifications.md)
  — Worker claims queued Runs directly; task notifications and outbox dispatch are retired.
- [AI package removal](./architecture/decisions/0027-remove-pi-sdk.md)
  — model and public research execution are unavailable; Cloud records, security
  and independent document verification remain.
- [Bun runtime decision](./architecture/decisions/0024-bun-runtime.md) — one pinned
  runtime for production, tooling, tests and isolated Runner processes.
- [Runtime and deployment](./architecture/deployment.md) — production runtimes,
  containers, Railway, PostgreSQL, and Electrobun distribution.
- [Decision records](./architecture/decisions/README.md) — decisions that
  constrain future work, and the conditions for revisiting them.
- [Internationalization decisions](./architecture/decisions/0004-use-intl-static-catalogs.md)
  — the `@raypx/i18n` facade, `en`/`zh` catalogs, Web loading, and recipient
  locale behavior.

## Development

- [Getting started](./development/getting-started.md) — requirements, setup,
  local services, and common commands.
- [Environment](./development/environment.md) — API, Better Auth, and mail
  environment boundaries.
- [Testing and verification](./development/testing.md) — workspace checks, CI
  expectations, and the Vite+/Vitest plugin boundary.
- [Cloud release acceptance](./development/cloud-acceptance.md) — verified local
  results, real-provider boundaries and the remaining live release gate.
- [Feature reduction and Electrobun acceptance](./development/feature-reduction-acceptance.md)
  — historical first-batch verification and native deployment gates.
- [Admin retirement and application naming acceptance](./development/admin-retirement-acceptance.md)
  — current removal, unscoped apps and verification results.
- [Web bundle baseline](./development/web-bundle.md) — how to compare the home
  route's initial client preloads and deferred interaction chunks.
- [Historical Workspace preview](./development/workspace-preview.md) — Clean Signal routes,
  preview data boundaries, project interactions, Pi states, and verification.
- [Visual implementation audit](./development/visual-audit.md) — historical UI
  findings and viewport acceptance checks.
- [File structure](./development/file-structure.md) — where a new file goes
  inside a workspace, and the conventions policy enforces.
- [Monolithic simplification](./development/monolithic-simplification.md) —
  frozen LOC measurements, retired-consumer evidence, and verification results.
- [Abstraction ablation](./development/abstraction-ablation.md) — measured
  removals, preserved behavior, and a rejected guard-removal experiment.
- [UI Kit ablation](./development/ui-ablation.md) — shared UI extraction,
  removed styling indirection, and retained abstractions.
- [Coding agents](./development/agents.md) — read order, default decisions,
  verification checklist, and skill governance for Codex and Claude Code.

Repository-level product and visual context also lives in
[PRODUCT.md](../PRODUCT.md) and [DESIGN.md](../DESIGN.md).

- [Neutral UI delivery](development/neutral-ui.md): global shadcn styling, captures and verification.
- [Historical beUI project index pilot](development/beui-pilot.md): sources, boundaries, updates and validation.
