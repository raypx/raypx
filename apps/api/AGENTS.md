# API composition

Bun/Nitro and Hono compose session/Space oRPC, HTTP API, server events, durable
Agent Runs, approvals/effects, computers, routines, memory, Pages, tools, models,
membership and delegation. Feature packages own use cases/repositories. API owns
authentication, configuration, credentials and transport adapters. No application
workspace is imported. Read current architecture topic guides before changes.

Resolve fresh Space membership for every operation and subscription; filter before
limiting. Mutations require trusted Origin and account quotas. Resource selectors
and deployment administration never grant Space access. Clients receive neither
execution ports nor secrets. Protected input stays outside history/events/checkpoints.

SERVER_ROLE is api, worker, relay or default all. PostgreSQL owns leases, fences,
checkpoints, recovery and event fanout. Runtime construction performs no I/O;
startup owns scans/subscriptions and shutdown releases owned resources. APIs start
work directly; workers recover claims and routines. Relay owns only native-only
/device routes and health, without Auth/mail/migrations/RPC. /events is the
session/Origin-authorized conversation/screen stream. No /relay, device task
projection, enrollment or account scheduler exists. Message uploads use the
Space-scoped messageAttachments procedures.

The connector registry revalidates current account/Space grants and fences per
operation. Split-process device routing requires the lazy private Redis broker;
combined deployments need no broker. Redis also supports optional caches,
sessions and rate limits. Device Auto approval remains forbidden. Browser Origin
is refused on possession routes. Credentials never enter URLs or diagnostics.
Authentication security changes revoke account connectors.

Startup applies the single foundation baseline unless explicitly disabled.
Never apply it to an operator/retired database or import old state. Maintenance
cleanup is Nitro-gated by JOBS_ENABLED and deletes expired auth/rate-limit records
in bounded locked batches. No production HTTP job runner exists.

Source-adjacent and tests/integration suites are database-free. test:postgres and
test:redis require explicit disposable services and run serially. The owned
workspace-server browser fixture is test-only; real device-daemon acceptance uses
private homes and an explicit loopback test database. Run check/test, then the
selected backend/browser gates. Packaged native/provider acceptance is separate.

Nitro KV storage is an explicit runtime dependency for bundled migration/assets; cold builds must never auto-install dependencies.

Runtime composes bounded message upload/delivery, notification queries and
device member files. RPC mutations retain session, trusted-Origin and quota
checks. /message-attachments downloads require fresh Space admission and always
force safe attachment disposition; never inline supplied documents.

Registration owns a transaction-locked account_bootstrap marker and fresh mail/signup admission through the auth adapter. SETUP_TOKEN is optional, API-only, bounded and rate-limited. No-mail accounts retain an unverified admission exemption. Recovery-link issuance commits with its audit, expires after 15 minutes and is returned once; test mail sends only to the current administrator.
