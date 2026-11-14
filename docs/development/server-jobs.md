# Routines and server maintenance

New Space routines run through the durable Agent backend. Retained account cloud
jobs and device timers are separate consumers, with different catch-up behavior.
The removed Automations pages are not part of the current Web/Desktop workspace.

## Space routines

Web/Desktop open routines from the Agent conversation header. Members can create
and edit routines, pause/resume them, test manually and open linked Run history.
`@raypx/jobs/model` owns editor ports and state; `/client` supplies the panel.
`@raypx/jobs/routines` owns injected use cases and ingress rules;
`/routines/postgres` owns Space-scoped persistence. API composes `routines.*` with
fresh membership, secret storage and normal Run dispatch.

Triggers include five-field Cron with an IANA zone, keyed webhooks, authenticated
email relay and signed repository events. Editing transfers ownership to the
editor; accepted Runs retain their initiating member. Pausing blocks future
automatic occurrences and leaves explicit manual tests available. One-time keys
appear only on creation/rotation, not list/history/event reads.

Worker-enabled roles (`worker`, `all`, retained `both`) start routine scans
explicitly. Runtime construction does no I/O. Space routine scanning is not gated
by `JOBS_ENABLED`, which controls the Nitro jobs below. PostgreSQL locks and
occurrence/delivery identities deduplicate concurrent scans and ingress. A schedule
coalesces missed work into at most one queued catch-up Run and keeps its oldest
due time; it does not burst all historical ticks. Runs at least 15 minutes late
receive their due and actual start times. History retains those observations.

A routine uses its owner's current membership, selected model/resources and
approval rules. Membership removal pauses definitions and clears ingress secrets.
Untrusted ingress is private Run context, not instructions that authorize writes.
Ordinary approval policy still applies; unknown effects never resend automatically.

### Ingress configuration

`AUTH_URL` supplies the advertised public API origin for webhook/repository URLs;
missing configuration yields an explicit unavailable reason. The default localhost
fallback is not advertised. Proxy `/routines/` to API-enabled roles.

- Webhooks use `POST /routines/:id/webhook`, `Authorization: Bearer <key>` and
  `Idempotency-Key`. The server stores a key digest, not the original key.
- Repository events use `POST /routines/:id/repository`, `X-Delivery-Id`,
  `X-Event-Kind` and `X-Routine-Signature`. HMAC-SHA-256 signs delivery ID, event
  kind and raw JSON bytes separated by newlines. The per-routine secret is encrypted.
- Email requires both `ROUTINE_EMAIL_RELAY_TOKEN` and `ROUTINE_EMAIL_DOMAIN`.
  A trusted external relay sends normalized authenticated email to the API's
  email ingress; Raypx runs no SMTP service. It uses an independent credential.

Body limits, replay checks and per-routine admission apply before dispatch.
See [routines and provenance](../architecture/capabilities.md#phase-4-backend-decisions)
for the exact wire format. Device-local `[routine_ingress]` is unrelated.

## Nitro maintenance and retained scheduling

API `src/jobs/` owns maintenance with thin handlers under `src/jobs/runtime/`.
Nitro schedules `maintenance:cleanup` every 15 minutes and retained
`schedules:tick` every minute. Both require deployment `JOBS_ENABLED=true` (false
in the local example). The cleanup also reads the administrator's Background
cleanup switch before each run. Worker-only roles run their separate Run/routine
scans rather than exposing a public task runner.

Cleanup uses PostgreSQL time, an advisory transaction lock and bounded row-locked
batches. Eligible records are OAuth access tokens, sessions and verification records
expired over 24 hours ago, rate limits idle over one hour, expired retained session
attachment projections, and retained context command bodies older than 24 hours. Each category handles at most 1,000 rows per invocation. Context
compaction preserves unknown-delivery digest receipts. Failure rolls back the
batch; the next scheduled invocation retries. Logs contain safe operation/count
status, never identifiers, tokens, row content or driver errors.

Cleanup does not delete Agent conversations, Run history, user accounts or local
profiles. Device revocation removes its terminal projections immediately rather
than waiting for maintenance. There is no production HTTP endpoint to invoke tasks.
Nitro's development-only task endpoint still respects `JOBS_ENABLED`.

### Retained account cloud jobs

`jobs.*`, `@raypx/jobs/server` and `/server/postgres` still support account-owned
`device.sync` and `agent.run` against an enrolled, authorized device epoch. These
procedures are not Space routines and have no current Automations navigation.
They recheck account/device/project authorization and keep their old skip policy:
missed occurrences, offline devices and overlapping active work are skipped rather
than caught up. Uncertain delivery pauses a plan without resending. Authoritative
terminal projections may resolve it later. Device-local timers remain in the CLI.
Do not import these records or extend them as a second Agent scheduler.

## Verification

```sh
bun run test --package @raypx/jobs
bun run test --package api -- src/jobs
bun run verify
```

Default suites inject clocks, mail, dispatch and storage. Separate PostgreSQL
modes cover locks, revisions, occurrence deduplication, coalescing and cleanup
rollback; [owned-backend browser journeys](testing.md#browser-suites-and-owned-backend-journeys)
cover routine editing/manual execution/history. Unit success establishes no database
or live ingress result. New scheduled tasks must state idempotency, concurrency
and retry policy before being enabled; do not reuse cleanup's lock for unrelated work.
