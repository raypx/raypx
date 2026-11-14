# Deployment and operations

The complete product runs on infrastructure the operator controls. This guide
covers the services, their roles and what the operator maintains.

## Services

| Service            | Required                 | Notes                                                                     |
| ------------------ | ------------------------ | ------------------------------------------------------------------------- |
| PostgreSQL         | Yes                      | The one authority.                                                        |
| Backend            | Yes                      | One artifact; `SERVER_ROLE` selects its roles.                            |
| Web                | Yes                      | Bun server rendering.                                                     |
| Sandbox supervisor | For `docker` computers   | Holds the Docker socket on the private network.                           |
| Object storage     | Optional                 | Attachments, page assets and home snapshots.                              |
| Redis              | For split device routing | Private connector frames; optional shared caches in combined deployments. |
| Mail               | Optional                 | Verification, sign-in codes and inbound routine email.                    |

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

- The unreleased `next` database is disposable. Its migration payload now contains
  one generated baseline, `20261114073022_baseline`, rather than the earlier chain.
  Use a fresh, isolated database for this baseline; an existing disposable `next`
  database must be recreated explicitly by its operator. This is not an upgrade
  procedure and imports no earlier schema, ledger or data. Never reset or migrate
  a retired/operator database. Later releases append migrations to this baseline.
- Baseline SQL and its snapshot were generated offline from `src/schema.ts` using
  the repository launcher, from `packages/database`:
  `bun --bun raypx-drizzle-kit generate --dialect postgresql --schema ./src/schema.ts --out /private/tmp/raypx-next-baseline --name baseline`.
  The output directory must be empty for a new baseline. Ordinary schema changes
  use `bun run db:generate` and retain the committed history. Composite constraints
  remain in the schema; content-free NOTIFY calls remain in feature transactions.
  There are no migration-only triggers or notification functions to relocate.
- Startup and explicit `bun run db:migrate` still serialize through one transaction
  advisory lock and commit the public ledger with schema changes. Database-free
  tests verify the single generated baseline and current table/column coverage;
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
- Site identity, registration, email and object storage are managed in the
  configuration center by a deployment administrator.
- A provider is configured once and used through its port. No provider-specific
  setting appears in domain records.

## Sandbox egress acceptance

The optional graphical image is selected by its immutable image ID and
`SANDBOX_GRAPHICAL=true` in the supervisor. The default image remains non-graphical.
No display port or provider endpoint is exposed to clients. Screen streams expire
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

## Device connector routing

`/device/*` is API ingress alongside `/rpc/*` and `/events`; Authorization must
reach it. Combined roles need no broker. Split device Computer frames reuse the
private Redis broker with a dedicated namespace; durable Runs still use PostgreSQL
only. Set `DEVICE_CONNECTOR_ORIGIN` to the same canonical public API origin in
every split API/worker/Relay role. API defaults to its public auth origin; a role
without the matching device origin fails closed instead of accepting another
origin's registration. Compose supplies that common origin in its split overlay.
The optional value accepts HTTPS or loopback HTTP, with no credentials, path,
query or fragment. See [device limits and acceptance](../development/device-connector.md).
