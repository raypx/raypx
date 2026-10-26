# @raypx/core

## Purpose

Platform-neutral task domain models and pure rules shared by transport adapters,
execution hosts and product views. Schemas are the single source of inferred types.

## Interface

- `.` exports the task models and pure activity/text rules.
- `/tasks` exports normalized task, activity, human-request/decision schemas,
  inferred types, provider capabilities, active statuses and decision validation.
  Task contexts freeze up to eight explicit source revisions. `taskExecutionPrompt`
  marks references separately and rejects combined prompts above 32,000 characters;
  never truncate or silently omit a selected source.
- `/activity` applies activity checkpoints/deltas and bounds activity pages.
- `/task-text` clips UTF-16 budgets without splitting code points and normalizes
  JSON strings for persistence.

## Constraints

No dependency on contracts, transports, authentication, environment, filesystem,
frameworks or storage. Keep HTTP/local/relay envelopes, device grants, cursors and
protocol versions in contracts. Do not duplicate domain schemas or inferred types
in adapters. Preserve current field limits, defaults and activity revision rules.
`normalizeTaskJson` accepts JSON-shaped values, not objects such as Date.

## Verification

Run bun run --cwd packages/core check and test, then the contracts consumer suites.
