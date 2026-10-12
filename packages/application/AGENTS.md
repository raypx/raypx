# @voidmix/application

## Purpose

Application commands and queries shared by the API and asynchronous Worker.
This package coordinates domain ports from `@voidmix/core`; it owns no HTTP,
database, AI SDK, or renderer concerns.

## Interface

| Path | Purpose                                                                                |
| ---- | -------------------------------------------------------------------------------------- |
| `.`  | Cloud, Identity, Projects, Assets, Reviews, Activity services and narrow ProjectAccess |

## Ownership

- `cloud.ts` composes domain factories under `cloud/`; `context.ts` shares
  transactional policies and projections. Domain factories own cloud commands,
  live scope authorization, account/round budget
  admission, owner/epoch/lease fencing, idempotent mutation replay, and atomic delivery
  publication. Terminal cleanup remains possible after permissions are revoked.
- Model/provider requests, object verification, signing and notification delivery
  happen in adapters outside SQL transactions. Hosts must verify objects before
  calling upload completion, and use `finishWithRevision` for Computer success.
  Generated files stay verified/private until atomic Revision publication.
  Orphan cleanup claims metadata before deleting objects and excludes active Runs.
- Worker control polls only fenced Run/commands. A 30-second Run lease must be
  renewed before expiry; expiry cannot be reversed. Recovery fails only expired
  Runs, including those from another host, and never replays side effects.
- New goals create immutable TaskRounds. Continue, retry and steer retain the
  round call budget; each Run receives its own duration allowance. Search uses
  six calls and 60 seconds; Computer uses forty calls per round and twenty
  minutes per Run. Account call admission and usage summaries use the same UTC
  calendar month. Acceptance
  compares current round/version/revision and rejects an active Task.
- Project owner accounts pay for all collaborators. Managers may spend; editors
  need explicit spending grants. Cancellation and publication share the Run/Task
  transaction, so cancelled output cannot become a published Revision.
- Execution grants persist a token hash, allowed actions and expiry; each call
  rechecks the current Run fence and permissions. Trusted server reconciliation
  may settle late usage but cannot publish output or revive a Run. Model dispatch
  uses startUsage with dispatchOnce to reject duplicate provider calls.
- Snapshots include complete message projections and a bounded recent event
  page. Their cursor is a consistent high-water sequence; older history pages
  use beforeSequence.
- `index.ts` composes Projects from lifecycle, member and task commands. Assets,
  Reviews and Activity have separate factories with only their own ports.
- `identity.ts` owns user queries, status changes and initial admin creation.
  Core supplies rules, transaction ports and audit construction.
- `context.ts` exposes the narrow ProjectAccess interface for cross-domain use.
- Resolve Project capabilities from personal ownership, Organization membership,
  and project-level grants.
- Keep command/query orchestration independent of Hono, Drizzle, and React.
- Execute Identity mutations and audit append through the Core administration
  transaction port; DB implements atomicity. Outbox delivery and provider
  lifecycle remain with adapters and hosting applications.

## Constraints

- Depend only on `@voidmix/core`.
- Non-Agent ports are required; production must never substitute an empty list
  for a missing repository. Test doubles belong in explicit fixtures.
- Validate a Review asset version exists and belongs to the requested project.
  Missing and foreign resources share the existing access-denied error.
- List queries delegate visibility and pagination to repository ports. Calls
  without limit/cursor preserve complete-list behavior.
- Use injected clock and id functions for deterministic tests.
- A Project operation always loads the Project before checking access; caller
  supplied ownership fields are never authorization input.
- Organization membership may establish a base capability; project membership
  may narrow it, never elevate it.

## Verification

```bash
bun run --cwd packages/application check
bun run --cwd packages/application test
```
