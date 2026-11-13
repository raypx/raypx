# @raypx/core

`/agents` includes named groups, participant/default-responder inputs and an
off-by-default cross-Space-message setting. `/conversation` includes structural
mentions, Agent authors, the `agent` trigger, parent-Run attribution and bounded
Agent-message refusal codes. Existing Run states and failures remain unchanged.

## Purpose

Platform-neutral task and account domain models and pure rules shared by transport
adapters, execution hosts and product views. Schemas are the single source of inferred types.

## Interface

- `/model-connections` owns account connection metadata, existing transport kinds,
  offered models, explicit all/selected Space availability and stable test outcomes.
  Secret values and persistence references are absent from public records.

- `/computers` owns vendor-neutral Computer state, generations, revisions, bounded
  member file previews and Space projections.
- `/approvals` owns account modes, revisioned settings and mode availability,
  exact-tool rules, Space approval requests and bounded effect records.
  Auto reports the stable REVIEW_MODEL_NOT_CONFIGURED reason.
- `/spaces` owns Space IDs, names, membership roles and pure membership matching,
  profile-backed directory projections, token-free invitation projections, sharing
  previews, approval overrides, append-only audit records and independent Space
  events. Space mutation codes do not extend Run or tool failure unions.
- `/agents` owns persistent Agent configuration and IDs, Conversation IDs and the
  pure direct-Conversation constructor. Model choices are opaque model IDs, with no
  provider vocabulary or credentials. These are separate from device-owned tasks.
- `/conversation` owns member Message and immutable ConversationEvent schemas, event
  sequences, Runs, reply segments, live text projections and pure retention-boundary checks. CONNECTION_UNAVAILABLE and COMPUTER_UNAVAILABLE
  are stable resumed-Run failures; execution capabilities and fences stay private to
  Agents/server. Writers implement `message.created`, `run.state`, `reply.segment`, `computer.state`, `card.created`, `card.resolved`, `tool.started` and `tool.finished`.
  Tool lifecycle metadata and bounded snapshot activity exclude arguments and results.
- `/memory` owns document/version schemas, mutation inputs and domain errors.
- `/jobs` owns local/cloud schedule schemas, domain errors and pure calendar
  calculations. Cron instances stay paused and are stopped after calculation;
  runtime timers and scheduling remain with the execution/server owners.
  Local Pi jobs require a project. They can combine Webhook, email and GitHub with
  either Cron or a project file watch.
  Local history can identify the occurrence or delivery source and link to the device-owned session.
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

Run bun run --cwd packages/core check and test, then the contracts consumer suites.

ModelSelection and ModelCatalog are pure domain metadata; connection fingerprints contain no credentials. TerminalProvider is narrower than AgentProvider.

Task create/follow-up/cancel/decision inputs and TaskContinuation are domain schemas.
Contracts composes them without domain re-export aliases. Wire field names remain transport-owned.

`/routines` owns Space routine definitions, occurrence/history/event projections
and five-field Cron validation. `/space-memory` owns Agent/shared memory revisions,
attribution, provenance and deterministic whole-document recall budgeting. These
entries are independent of retained account/device `/jobs` and `/memory`.
Computer approval names also cover the memory save/update change tools.

Conversation schemas also describe named groups, explicit Agent mentions, Agent
authors and optional Agent/parent Run attribution on events, segments and live text.
Group mutation and Agent messaging refusals are separate from Run failure unions.

`/pages`, `/skills` and `/mcp-servers` own bounded Page/version/share metadata,
text-only skill ownership/availability and remote server configuration/test outcomes.
`/approvals` separately validates namespaced remote names without extending the
built-in enum. Space events add content-free `page.created/updated/deleted` records.
