# Architecture Decision Records

An ADR records a decision that constrains future work: something a later change
should not quietly reverse. The root `AGENTS.md` refers to "an explicit
architecture decision" in several rules; this directory is where those live.

## When to write one

Write an ADR when a choice narrows the options available later — a package
boundary, a runtime, a UI primitive library, a task orchestrator, a data model
that other layers must agree with. Do not write one for a reversible
implementation detail; put that in the owning workspace's `AGENTS.md` instead.

## Conventions

- File name: `NNNN-kebab-slug.md`, four digits, monotonic, no gaps.
- Title: `# ADR-NNNN: Sentence-case title`.
- Sections, in order: `Status`, `Context`, `Decision`, `Consequences`,
  `Follow-up`. Copy [`template.md`](./template.md).
- `Status` is `Proposed`, `Accepted`, or `Superseded by ADR-NNNN`.
- **ADRs are never deleted or rewritten to say something else.** Supersede by
  writing a new one that names the old, and update the old record's `Status`.
  The value of the record is that it explains a decision that is still in force,
  or why one stopped being.
- `Follow-up` states the condition under which the decision should be revisited.
  An empty `Follow-up` means the decision is not expected to be reopened.

## Records

- [ADR-0001: Base UI and shadcn base-nova over Radix](./0001-base-ui-over-radix.md)
- [ADR-0002: Vite+ as the only task orchestrator (superseded)](./0002-vite-plus-sole-orchestrator.md)
- [ADR-0003: Three skill discovery roots](./0003-three-skill-discovery-roots.md)
- [ADR-0004: use-intl facade with static catalogs](./0004-use-intl-static-catalogs.md)
- [ADR-0005: Recipient locale on mail inputs](./0005-recipient-locale-on-mail-inputs.md)
- [ADR-0006: Optional Redis cache and Better Auth secondary storage](./0006-redis-cache-and-auth-secondary-storage.md)
- [ADR-0007: Web locale catalogs load by locale](./0007-web-locale-catalog-loading.md)
- [ADR-0008: Keep domain contexts in one core package until stable consumers exist](./0008-domain-contexts-stay-in-core.md)
- [ADR-0009: Pi SDK as the VoidMix Agent runtime](./0009-pi-as-agent-runtime.md)
- [ADR-0010: Account-first Project V2](./0010-account-first-project-v2.md)
- [ADR-0011: Colocate single-route pages with their routes](./0011-colocate-single-route-pages.md)
- [ADR-0012: Merge environment and logging into the shared foundation](./0012-shared-environment-and-logging.md)

The supported renderer and Mail locales are `en` and `zh`. Catalog parity and
source-boundary checks run with `bun run i18n:check` and are the first gate of
`bun run verify`.

- [ADR-0013: Domain modules and retirement of unused V1 code](./0013-domain-modules-and-retired-code.md)

- [ADR-0014: Domain services and scoped client state](./0014-domain-services-and-client-state.md)
- [ADR-0015: Local Agent execution and shared business UI](./0015-local-agent-workbench.md)
- [ADR-0016: Cloud Agent platform and SaaS foundations](./0016-cloud-agent-platform.md)
- [ADR-0017: Fenced execution Gateway and immutable task rounds](./0017-gateway-and-task-rounds.md)

- [ADR-0018: Turbo task orchestration with Vite+ leaf tools](./0018-turbo-task-orchestration.md)
