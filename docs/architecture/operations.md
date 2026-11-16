# Deployment and operations

The complete product runs on infrastructure the operator controls. This guide
covers the services, their roles and what the operator maintains.

## Services

| Service            | Required                 | Notes                                                                                     |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------- |
| PostgreSQL         | Yes                      | The one authority.                                                                        |
| Backend            | Yes                      | One artifact; `SERVER_ROLE` selects its roles.                                            |
| Web                | Yes                      | Bun server rendering.                                                                     |
| Sandbox supervisor | For `docker` computers   | Holds the Docker socket on the private network.                                           |
| Object storage     | Optional                 | Stores new chat attachment bytes when enabled. PostgreSQL owns metadata and inline files. |
| Redis              | For split device routing | Private connector frames; optional shared caches in combined deployments.                 |
| Mail               | Optional                 | Verification, sign-in codes and inbound routine email.                                    |

A deployment with no model connection, no sandbox provider and no mail still
starts. Each missing capability is an explicit state in the product.

## Roles

- `SERVER_ROLE=all` is the default: `api`, `worker` and `relay` in one process.
- Split roles use the same artifact. Durable Run API/worker coordination needs no
  broker: leases, attempts, checkpoints, steering and backup jobs are PostgreSQL
  records, and content-free `LISTEN/NOTIFY` hints wake recovery. Device connector routing requires Redis when connection owners and requesters are separate processes.
  See [ADR 0066](0066-server-owned-agent-platform.md).
- Run any number of `api` and `worker` processes. A Run executes once because of
  its lease. See [execution](execution.md#ownership).
- The `worker` and `relay` roles start without sign-in or mail configuration and
  expose no RPC. Worker starts scans only after runtime construction and needs the
  same configured model and Computer resources as API.
- `RUN_RECOVERY_INTERVAL_MS` defaults to five seconds; leases last 15 seconds and
  heartbeat every five seconds. Attempt timeout defaults to five minutes and the
  keyed backup job is due 30 seconds later. See [execution](execution.md#deployment-timing).

## Capacity

- A Run starts in the process that creates it. There is no global concurrency cap
  and no worker slot to wait for.
- A process that lacks memory headroom hands its new Runs to another process.
- Computers start lazily and stop when idle. Deployment settings cap computers per
  member and per Space, and set container memory, CPU and process ceilings.

## Deploys

- The Railway `next` database has applied `20261115004545_baseline`. Keep that
  baseline and its ledger entry intact. E2B and subsequent schema changes append
  generated migrations. New installations apply the same chain to a fresh,
  isolated Raypx database.
- Baseline SQL and its snapshot were generated offline from `src/schema.ts` using
  the repository launcher, from `packages/database`:
  `bun --bun raypx-drizzle-kit generate --dialect postgresql --schema ./src/schema.ts --out /private/tmp/raypx-next-baseline --name baseline`.
  The output directory must be empty for a new baseline. Ordinary schema changes
  use `bun run db:generate` and retain the committed history. Composite constraints
  remain in the schema; content-free NOTIFY calls remain in feature transactions.
  There are no migration-only triggers or notification functions to relocate.
- Startup and explicit `bun run db:migrate` serialize through one transaction
  advisory lock and commit the public ledger with schema changes. Database-free
  tests verify the deployed baseline, snapshot chain and current table/column coverage.
  `TEST_DATABASE_URL=<disposable-test-url> bun run --cwd apps/api test:postgres`
  verifies clean application, concurrent startup, retries and rollback separately.
  Local PostgreSQL 17 acceptance covers the baseline and startup checks.
- Apply migrations, then replace processes. The previous release keeps running for
  a short time, so every migration works with the previous release's code. See
  [domain](domain.md#migrations).
- A process that receives a stop signal finishes its HTTP requests, releases its
  Runs and exits. Another process resumes them.
- Client builds declare their version. The backend refuses a client that is too old
  with an explicit update state.

## Backups and recovery

- Back up PostgreSQL and the secret store's wrapped keys together.
- Home snapshots in object storage are the backup of computer state.
- A restore drill is part of release acceptance: restore into a clean deployment,
  then open a conversation, resume a Run and start a computer.
- An account can export its Spaces as an archive that excludes secrets.

## Observability

- Structured logs use the shared logger with the redaction rules in
  [security](security.md#logging-and-audit).
- Run timing is logged as described in [execution](execution.md#timing).
- `/health` reports the process; `/ready` reports PostgreSQL and each configured
  optional service.
- Tracing is optional and exports through a standard protocol.

## Configuration

- Database, origins, secrets and roles are environment configuration.
- Site identity, registration, email, object storage and sandbox connections are managed in the
  configuration center by a deployment administrator.
- Provider settings use PostgreSQL revisions, encrypted write-only credentials and
  the existing invalidation path. Computer operations read current policy in API and
  worker roles without restart. Private supervisor placement is excluded from domain
  records/events; see [Computers](computers.md#deployment-configuration).

## Sandbox egress acceptance

The optional graphical image is selected by its immutable image ID and
`SANDBOX_GRAPHICAL=true` in the supervisor. The default image remains non-graphical.
No display port or provider endpoint is exposed through member Computer contracts. Screen streams expire
after five minutes, require ACKs within ten seconds and periodically recheck
sessions/membership. Control grants expire after thirty seconds without renewal;
view disconnect, stop, replacement and membership revocation release them with
Space audit evidence. PostgreSQL is the authority across API/worker processes.
See [sandbox setup](../development/sandbox.md) for measured image sizes and the
real-Engine graphical probe. Native Mobile has no Screen surface.

Run `bun run raypx-dev test sandbox --with-egress --dns-resolver 1.1.1.1` on the
Linux Engine host, with root or passwordless sudo, Docker's iptables backend and
prepared gate prerequisites. `--engine-socket /absolute/path` selects a local
Engine socket. The gate builds an owned computer image, starts its supervisor and
computer, applies only its generated bridge's rules and removes owned resources
and rules afterward. It never changes an existing deployment's bridge policy.
Without `--with-egress`, or on a platform without the required host privileges,
egress is reported as not run; conformance is a separate result. A namespace
mismatch refuses application. A socket forwarding to another network namespace
does not authorize changing the caller's firewall. For a VM Engine, explicitly
set `--engine-host-command` to a JSON argv prefix that executes root commands on
that host; the checkout must be mounted at the same absolute path. Every rule
apply, counter read and removal uses that prefix. The host-service probe uses an
owned host-network canary, independent of the supervisor's listener.

For a deployment, use the same public IPv4 address in `SANDBOX_DNS_RESOLVER` and
`infra/sandbox/egress.sh --bridge rpx<10hex> --resolver ADDRESS --apply`.
The default is `1.1.1.1`. Preview with `--dry-run`; remove the previous owned rules
before changing the resolver. Set `SANDBOX_RESTRICTED_EGRESS=true` and
`SANDBOX_HOST_RULES_APPLIED=true` only after applying and verifying those host rules.
The embedded resolver forwards only to that upstream; direct UDP/TCP DNS to
other addresses is dropped. Public HTTPS is allowed, so encrypted DNS/tunnels
over HTTPS remain outside this packet policy.

The gate compares bounded HTTPS/DNS probes inside the computer with Engine-host
controls. Metadata, private ranges and alternate DNS require owned DROP-counter
increases as well as failed connections; host loopback has a known-open control.
An offline host and computer yield explicit public HTTPS `unavailable` and a
separate configured-DNS availability result. TLS/HTTP/DNS-protocol errors, malformed
probe output and a computer-only failure fail acceptance. Never record an offline
public reachability result as passed. See [computers](computers.md) for scope and
platform limits. Fake Engine and dry-run tests do not establish live enforcement.
IPv6 enforcement is unavailable when the Engine-host control cannot reach IPv6;
a reachable control requires a computer timeout and an owned IPv6 DROP counter.
An embedded-DNS SERVFAIL is unavailable only alongside an independently observed
host upstream network failure; direct upstream SERVFAIL remains a failure.

## Review model operations

`APPROVAL_REVIEW_MODEL_ID` optionally selects the independent action reviewer
from `AGENT_MODELS` using `AGENT_MODEL_CREDENTIALS`. Configure API and worker
roles alike. Without a resolvable selection, Auto is unavailable; persisted Auto
settings ask the member. Review never falls back to Never ask or ambient keys.

## Shared-origin routing

`apiIngress` in [the deployment contract](../../packages/tooling/src/build/deployment.ts)
declares one `/api/` prefix and four root exceptions: the two standard discovery
documents, `/health` and `/ready`. Both probes remain publicly forwarded. The real
router is checked at startup in every built role and in source tests; proxy tests
and policy enforce the minimal rule. Feature additions never add gateway entries.
`/pages` and other Web destinations remain on Web. Page `frame-ancestors` comes from the derived HTTP(S) trusted origins,
including `PUBLIC_URL` and the public API origin. Proxies preserve API
response headers; Web's Nitro framing denial never wraps API responses.

## Public address configuration

Production requires `PUBLIC_URL`, the exact HTTPS origin members open in Web.
`API_PUBLIC_URL` is optional and defaults to `PUBLIC_URL`; supply it only when API
is published on a different origin. Both reject trailing slashes, paths, queries,
fragments, credentials and wildcards. `EXTRA_ALLOWED_ORIGINS` is an optional
comma-separated list of exact additional browser origins (HTTP(S), no wildcard).
API normalizes and deduplicates the Web/API origins, fixed native client origins
from `@raypx/core/auth`, and extras. Authentication, passkey RP defaults, routine
ingress metadata, connector checks, CORS, RPC mutations, event sockets and Page
frame ancestors consume this derivation. Invitation and Page share links in clients
continue to use their selected Web/API origins; Web build-time URL handling is
unchanged. Native identities grant no session or Space membership.

Without explicit public settings, development uses Web `http://localhost:3000`
and API `http://localhost:3002`. Supplying `PUBLIC_URL` selects the shared-origin
default; set `API_PUBLIC_URL` explicitly for separate development ports.

`AUTH_URL`, `ALLOWED_ORIGINS` and `DEVICE_CONNECTOR_ORIGIN` are rejected at startup,
even when empty. See [deployment migration](../development/deployment.md#public-address-configuration)
for rollout order and rollback settings. All backend roles share this contract.

## Device connector routing

`/api/device/*` shares the single API prefix; Authorization must
reach it. Combined roles need no broker. Split device Computer frames reuse the
private Redis broker with a dedicated namespace; durable Runs still use PostgreSQL
only. Every split API/worker/Relay role derives connector origin checks from
`API_PUBLIC_URL`, defaulting to `PUBLIC_URL`. Supply matching public-address
settings to every role; no independent connector-origin input exists.
See [device limits and acceptance](../development/device-connector.md).

Worker maintenance deletes expired unsent uploads and transient device file reads
in batches of 100. Upload rows expire after 24 hours; member reads expire after ten
seconds. Published attachments live with their conversation. Notification sources
are queried from PostgreSQL, with no push service to deploy. See
[limits and lifecycle](member-input-and-notifications.md).

## Migration diagnostics

Migration jobs and startup validate every applied ledger name, timestamp and SHA-256
against the release before running DDL. Missing/renamed files, edited applied SQL,
duplicate entries and holes before a later applied entry stop the rollout and name
the differences. Restore the exact applied files from the deployed release, verify
that the database is the intended isolated Raypx database, or restore a verified
backup into an isolated database. Intentional reconciliation requires an operator
review of schema and history together; never delete ledger rows or rerun a baseline.
No automatic repair or schema change is performed.

Failures identify the migration (or connection/lock/history/configuration phase),
SQLSTATE or driver code and a safe message. Primary PostgreSQL messages may contain
values; known SQLSTATEs use fixed summaries and unknown messages are withheld.
SQL, parameters, DETAIL, HINT, connection options and credentials are never printed.
Harmless schema/table-exists NOTICEs are suppressed only on migration connections.
Lock acquisition remains bounded to 120 seconds and DDL lock waits to ten seconds;
connection establishment is bounded to five seconds. Both explicit pre-deploy and
startup use these diagnostics and the same transaction-scoped lock.

API and Web publish their immutable build in `x-raypx-revision`; gateway adds its
own `x-raypx-gateway-revision` to forwarded responses. Public deployment smoke
requires all three to agree. Public configuration's `ingressVersion` lets Web
show one updating state and automatically recover from an incompatible API.
