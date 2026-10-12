# ADR-0016: Cloud Agent platform and SaaS foundations

Status: accepted; supersedes the initial delivery order in [ADR-0015](0015-local-agent-workbench.md).

## Decision

The first release is a Web-first cloud Search and Computer product. Worker owns
Pi and trusted tools; API owns authentication, final authorization, commands and
subscriptions. Desktop first becomes a cloud client; local execution follows.
No arbitrary model code, shell, GUI automation or dynamic executable extensions
are available before a separate sandbox design is accepted.

Create a fresh database and migration baseline. Historical migrations remain
archived; no old business data or client protocol is migrated. New cloud
contracts use the explicit `cloud` namespace and `cloud.run.queued` outbox type.
Core owns scope, execution, budget and storage ports; Application owns workflows;
DB owns metadata and transactional state. API and Worker share a server-only
Storage adapter for private S3 objects. Apps never import one another.

Task success requires accepting the current delivery revision. Run success alone
does not complete a Task. Each Task has one active root Run, up to two concurrent
children, and one delegation level. The root and children share a default
20-minute/40-model-call budget. Calls, retries and compaction are metered;
unknown usage is distinct from zero. Actor and resource scope are host-bound.

Reference next-forge's SaaS capability coverage while retaining Better Auth,
TanStack Start, Base UI, oRPC, Drizzle, Bun and Vite+. Add Sentry, explicit PostHog
events, typed configuration flags, durable usage, private storage and task
notifications. Payments, live editing, generic webhooks and CMS are deferred.
Telemetry excludes prompts, file bodies, credentials and signed URLs.

Replace the Auth secondary-storage decision in [ADR-0006](0006-redis-cache-and-auth-secondary-storage.md)
with PostgreSQL authority for sessions, verification, revocation and Auth policy.
Redis supplies only the atomic AI admission limiter. An initial Redis connection
failure leaves the API available for historical reads; new production runs fail
closed until Redis recovers and the API restarts. A connected client's transient
command failures reject admissions until its connection recovers. Better Auth's
default per-process Auth rate limiter remains separate from AI admission limits.

Bun manages installation and scripts; production runs Node 24.18.0. Worker
builds a real Node artifact and uses Debian slim with pinned conversion tools
and Chinese fonts. Fixed generators produce Markdown/PDF, XLSX/CSV and
PPTX/actual PDF previews. Required providers fail explicitly when unavailable.

## Consequences

The new protocol and runtime must be switched together. Outbox delivery leases
do not confer execution ownership; owner epochs fence stale writes. File
uploads and provider effects use durable intents outside SQL transactions.
Cloud sessions own replay and connection state; shared Agent UI is controlled.

See [cloud platform](../cloud-platform.md) for implementation and verification.
