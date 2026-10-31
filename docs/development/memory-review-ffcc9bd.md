# Memory review remediation: ffcc9bd

> Historical validation record. Legacy protocol fallback, local-account workspaces,
> storage migration and compatibility exports described below were removed on 2026-10-31.
> Current behavior is specified by the architecture documents and package instructions.

This ledger tracks the twelve findings against the original implementation.
The new implementation preserves account/device ownership, immutable history,
CAS and execution receipts.

| Finding                                        | Result                                                                                                                                                                                                                                | Evidence                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Follow-up repeats context                   | Fixed. Confirmed resumed sessions receive only new input; task metadata retains its snapshot. Both providers reject a changed session ID; Codex rejects it before user input. Missing/rejected sessions do not auto-restart.          | CLI host fixtures cover both providers, long parent context, rejected resume, missing session and changed Codex thread identity.     |
| 2. Restore changes archive state               | Fixed. PG and SQLite copy content fields while preserving the current archive state.                                                                                                                                                  | Service, SQLite and real PostgreSQL restore regressions cover both archive states.                                                   |
| 3. Unarchive history is ambiguous              | Fixed. New writes use `unarchived`; old `restored` records without `restoredFrom` keep the unarchive presentation.                                                                                                                    | Bilingual timeline component coverage and both repository suites.                                                                    |
| 4. Command snapshots live forever              | Fixed for private replay bodies. Matching authoritative tasks release duplicate commands; unconfirmed bodies are compacted by age/count/byte windows. Unknown delivery deliberately retains a small digest receipt to prevent replay. | Routing recovery tests and real PostgreSQL tests for TTL, 4,096 entries, UTF-8 8 MiB, bounded batches and partial-index query plans. |
| 5. Archive hides schedule impact               | Fixed. Account confirmation loads referencing plans and shows an accurate count with bounded name/status previews; lookup failure is unknown. Local memory never reads cloud plans.                                                   | Shared component lifecycle tests and both application adapters.                                                                      |
| 6. No-op update increments revision            | Fixed. Both repositories check CAS first and avoid a new revision for equal input.                                                                                                                                                    | SQLite/PostgreSQL/service no-op and stale-write tests.                                                                               |
| 7. Removed project prevents editing            | Fixed. Unchanged project ownership allows content edits; assigning another project is validated. Task resolution still checks the actual destination.                                                                                 | Service and both persistence suites.                                                                                                 |
| 8. Create retry validates project too early    | Fixed. Immutable version-one idempotency is checked before project validation and again atomically at creation.                                                                                                                       | Lost-response/project-removal retry regressions.                                                                                     |
| 9. UUID case mismatch                          | Fixed. Context schemas normalize UUIDs. Both repositories locate legacy case variants using physical keys and reject canonical collisions.                                                                                            | Core normalization, direct legacy-data PostgreSQL and SQLite fixtures.                                                               |
| 10. Spoofable text delimiters                  | Fixed with deterministic collision-checked boundaries; raw source text keeps its original formatting. References remain untrusted task data.                                                                                          | Core forged-boundary, raw-markdown and budget regressions.                                                                           |
| 11. Real prompt budget is scattered            | Fixed. The shared resolve service requires the actual prompt; API and local execution pass it explicitly. Execution keeps its independent final preflight.                                                                            | Service combined-budget tests, routing-port assertions and provider fixtures.                                                        |
| 12. Stale preview errors overwrite new preview | Fixed. Success, validation failure, error, close, refresh and collapse respect preview generation.                                                                                                                                    | Deferred-request component regressions.                                                                                              |

The replay-body window is a recovery policy, not permission to repeat an unknown
effect. Digest receipts for unknown delivery remain until authoritative recovery;
they contain no request or reference body. Cleanup retains its deployment and
administrator switches; admission also enforces the per-account body window.

## Initial verification on 2026-10-26

- `bun run verify`: passed, including 1,014 tests, type/lint/format/policy/i18n
  checks, builds and relocated Node/Worker/standalone CLI artifact probes.
- Isolated PostgreSQL Node suite: 44 passed. Worker PostgreSQL suite: 6 passed.
  Both applied the generated foundation migration to the temporary test database.
- `bun run test e2e`: 34 passed, 2 skipped. The skipped cases require configured
  live relay/native/provider environments; they are not accepted as passed.
- macOS `native:smoke`: packaged shell and both restart/restore phases passed,
  including local state and server-origin isolation. Test bundles were removed.
- The isolated PostgreSQL server was stopped and its temporary data removed.

Real Windows packaging, production HTTPS and paid provider execution are separate
acceptance gates. Fixture and workerd results must not be described as those gates.

## Follow-up review

- Added a generated global `lower(id)` unique index. Creation/idempotency lookups
  remain case-insensitive without full-table scans; PostgreSQL rejects canonical
  collisions across accounts. Existing uppercase physical keys stay valid.
- Replaced the JSON body envelope with deterministic boundary tokens checked
  against source names, raw bodies and the user prompt. Markdown, quotes and
  backslashes are preserved without charging JSON escaping to the prompt budget.
- Codex now rejects a changed resumed thread ID with `SESSION_UNAVAILABLE` before
  sending user input, matching Claude's refusal to continue a different session.
  The child task retains its context snapshot and does not replace its saved session.

Follow-up verification:

- `bun run verify`: passed with 1,016 tests across 21 workspaces, all checks and
  Node/Worker/standalone CLI artifact probes.
- Core: 10 passed. CLI host: 34 passed, including both changed-session regressions.
- Isolated PostgreSQL Node suite: 45 passed. Existing and missing creation-ID
  lookups use the unique index with 6,000 unrelated documents; direct canonical
  duplicate inserts fail across accounts.
- Worker PostgreSQL suite: 6 passed against the same generated migrations.
- Browser E2E and macOS packaged GUI results above belong to the initial remediation;
  those gates were not repeated for this follow-up. Real provider execution remains
  unverified.

## Product review: quota recovery and visible budgets

- Archived references now expose an explicit permanent-delete confirmation. The
  expected revision, owner and archived state are checked atomically in both
  repositories. Source/version rows are removed and one quota slot is freed.
  Repeated deletion of the same revision returns the same acknowledgement.
- Body-free deletion receipts reserve IDs globally; retries cannot recreate a
  deleted source under its old ID. Accepted task/command context snapshots remain
  independent. The confirmation explains both deletion and snapshot retention.
- Added the additive PostgreSQL deletion-receipt migration and SQLite schema-v2
  migration. Account deletion cascades its receipts. No user database was migrated.
- Task and scheduled Agent-plan editors display exact combined character counts,
  near-limit warnings and over-limit errors. They share Core's raw-text execution
  formatter. Selected revision bodies stay in component memory; typing performs
  no extra reads. Account/target/selection changes cancel obsolete reads.
- Pending/unknown and oversized budgets block button, keyboard and form submission;
  failed reads offer an explicit retry. Runtime validation remains authoritative.
- The other product ideas (search/default references/templates/version diff/plan
  upgrades/follow-up additions/copying/usage/suggested memory) are outside this change.

Targeted acceptance: memory package 37, SQLite 9, task composer 4 and isolated
PostgreSQL 46 tests passed; repository type checks passed. Broader gates are recorded
below after completion.

Product gate results:

- PostgreSQL Node: 46 passed. Worker PostgreSQL: 6 passed, including permanent
  deletion, repeated acknowledgement and preserved task context through the real RPC.
- Browser E2E: 34 passed, 2 live-environment cases skipped. Both surfaces cover
  over-limit submission blocking and source deletion with retained task context.
  Web's 390 px budget and deletion-confirmation screenshots were inspected;
  Desktop uses its desktop-width layout. The screenshots wait for real animations.
- macOS packaged smoke: shell and both restore phases passed. The shell explicitly
  creates, archives, deletes and re-deletes a disposable reference through Native
  IPC, then verifies it is missing. Test bundles were removed.
- Native type checks passed after extending that smoke. The temporary PostgreSQL
  server and its data were stopped/removed.
- Initial cold parallel UI workers exceeded startup timeouts; isolated UI runs
  passed. Two existing CLI timing cases also initially timed out; their 37-case
  isolated run and the full default verification rerun passed without changing
  runner isolation, concurrency or timeout policy.

- Final `bun run verify`: passed, 1,024 tests across 21 workspaces, 55/55 tasks
  and all relocated Node/Worker/standalone CLI probes. This includes the bounded
  long-prompt editor and the extended Native smoke's type checks.
- The existing Desktop instance-takeover test also failed once during a broad
  run; its isolated 4-case suite and the final full rerun passed. This remains
  recorded as a test-stability observation, not a change to instance-lock behavior.

Windows packaging, production HTTPS and real paid-provider execution remain
unverified for this product follow-up. No changes were committed or deployed.
