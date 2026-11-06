# @raypx/core

## Purpose

Platform-neutral task and account domain models and pure rules shared by transport
adapters, execution hosts and product views. Schemas are the single source of inferred types.

## Interface

- `/auth` exports public account/session types, social provider identifiers and
  trusted-origin normalization shared by Auth, API, Control, Relay and Web.
- `/permissions` exports the framework-free role names and application permission
  vocabulary shared by the wire schemas and Auth's ACL. It is vocabulary, not policy:
  Better Auth owns role grants.
- `/tasks` exports normalized task, activity, human-request/decision schemas,
  inferred types, provider capabilities, pure provider presentation metadata, active statuses and decision validation.
  Task contexts freeze up to eight explicit source revisions. `taskExecutionPrompt`
  marks references separately and rejects combined prompts above 32,000 characters;
  preserve raw bodies with deterministic collision-checked boundaries; never truncate
  or silently omit a selected source.
  `taskExecutionBudget` measures that same format without throwing above the limit.
- `/activity` applies activity checkpoints/deltas and bounds activity pages.
- `/task-text` clips UTF-16 budgets without splitting code points and normalizes
  JSON strings for persistence.
- `/agent-runs` exports the read-only task-to-Run status projection; AgentTask remains
  the sole persisted lifecycle. Future manifests and transitions belong in design docs.

## Constraints

No dependency on contracts, transports, authentication implementations, environment, filesystem,
frameworks or storage. Keep HTTP/local/relay envelopes, device grants, cursors and
protocol versions in contracts. Do not duplicate domain schemas or inferred types
in adapters. Preserve current field limits, defaults and activity revision rules.
`normalizeTaskJson` accepts JSON-shaped values, not objects such as Date.

## Verification

Run pnpm --dir packages/core run check and test, then the contracts consumer suites.

ModelSelection and ModelCatalog are pure domain metadata; connection fingerprints contain no credentials. TerminalProvider is narrower than AgentProvider.

Task create/follow-up/cancel/decision inputs and TaskContinuation are domain schemas.
Contracts composes them without domain re-export aliases. Wire field names remain transport-owned.
