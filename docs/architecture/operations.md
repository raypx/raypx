# Deployment and operations

The complete product runs on infrastructure the operator controls. This guide
covers the services, their roles and what the operator maintains.

## Services

| Service            | Required               | Notes                                                  |
| ------------------ | ---------------------- | ------------------------------------------------------ |
| PostgreSQL         | Yes                    | The one authority.                                     |
| Backend            | Yes                    | One artifact; `SERVER_ROLE` selects its roles.         |
| Web                | Yes                    | Bun server rendering.                                  |
| Sandbox supervisor | For `docker` computers | Holds the Docker socket on the private network.        |
| Object storage     | Optional               | Attachments, page assets and home snapshots.           |
| Redis              | Optional               | Event fanout and shared caches for larger deployments. |
| Mail               | Optional               | Verification, sign-in codes and inbound routine email. |

A deployment with no model connection, no sandbox provider and no mail still
starts. Each missing capability is an explicit state in the product.

## Roles

- `SERVER_ROLE=all` is the default: `api`, `worker` and `relay` in one process.
  Existing explicit `SERVER_ROLE=both` deployments keep that combined behavior,
  including recovery; existing environment files continue to work.
- Split roles use the same artifact. Durable Run API/worker coordination needs no
  broker: leases, attempts, checkpoints, steering and backup jobs are PostgreSQL
  records, and content-free `LISTEN/NOTIFY` hints wake recovery. The retained
  device Relay transport still uses optional Redis when API and Relay are split.
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
