# Validation scripts and generated evidence

Reusable automation lives in `packages/dev-cli/src/validation/`. `.artifacts/`
contains generated evidence only. Turbo owns the sole task/cache graph; leaf
scripts never re-enter it. `raypx-dev` discovers workspaces from root manifests.

`bun run verify` selects affected source checks/tests and host checks for native
inputs. `--full` runs repository-wide audits, builds and current-platform artifact
probes. PostgreSQL, browser, Engine, live model and packaged native gates stay
explicit. See [testing](testing.md) for commands and limits.

`bun run test backends --with-e2e --database-url <disposable-test-url> -- --workers=1`
records API PostgreSQL/Redis results, owned service logs and browser JSON in one
evidence directory. Its explicit database mode never starts or drops another
database. The browser fixture is test-only and is never shipped in production.

Native CI compiles one production CLI payload, signs/seals it, archives it and
passes its immutable inventory to consumers. Format 2 includes the executable,
metadata and legal files. Consumers verify identity and never build implicitly.
The native checks run process runners, installed CLI smoke and Go checks. Separate
distribution jobs cover package/signature/interactive acceptance. Local tests use
private homes and owned processes; unrun platforms remain unverified.

Build-size reports describe current CLI/Desktop components. Cache keys include
source prerequisites, relevant environment and platform identity. Tests and docs
are excluded from dependency transit hashes; their own tasks still hash their
inputs. `bun run policy` validates public-entry consumers, dependency cycles,
runtime/tooling boundaries, pins, catalogs and documentation links.

`bun run unused` and repository audit tasks inspect the current manifest graph;
removed workspaces/public entries must disappear from both consumers and tooling.
`bun run clean:artifacts` removes generated evidence/test reports while preserving
builds and user data. Never store authored automation under `.artifacts/`.

Artifact probes use the explicit disposable TEST_DATABASE_URL when supplied to
exercise relocated API routes and readiness. Without it, the API probe requires
the sanitized startup refusal caused by unavailable PostgreSQL; it does not claim
healthy API acceptance. Relay probes retain an unavailable broker check.

## Owned sandbox real-Engine acceptance

```sh
bun run raypx-dev test sandbox
bun run raypx-dev test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
DOCKER_HOST="unix://$HOME/.colima/default/docker.sock" bun run raypx-dev test sandbox
# Explicitly authorizes temporary host firewall changes; Linux Engine host only:
bun run raypx-dev test sandbox --with-egress
```

Install repository dependencies with the pinned Bun and provide Docker CLI plus a
reachable Linux Engine supporting API v1.47 or later. Registry access and image
build internet access are required. The gate pulls the pinned Bun tag and
`python:3.13-slim-bookworm`, resolves their repository digests, then builds
`infra/sandbox/Computer.Dockerfile` using those immutable inputs for the Engine's
native Linux architecture, overriding inherited platform defaults. Base images and
build cache may remain cached. The resulting immutable Engine image ID selects
the locally built image without requiring publication to a registry.

The `--runtime` option selects the installed OCI runtime (default `runc`). The
same gate adds privilege escalation/mount/proc/sys attempts, bounded fork/memory
exhaustion, disk-overrun stop and cross-sandbox network probes. See
[untrusted tenant hosting](sandbox-hosting.md) for production requirements.

Private input acceptance verifies UTF-8 stdin/environment delivery with hashes,
helper-input cleanup and one-command scope. Inbox acceptance uses the same bounded
Computer write/read operations as backend attachment delivery, with a 1 MiB file
and post-write accounting. The gate does not run PostgreSQL approval/upload/fencing
acceptance; those are separate backend suites.

Missing Docker or an unreachable Engine fails before state or services are
created. `--engine-socket` takes precedence over Unix `DOCKER_HOST`; otherwise the
default is `/var/run/docker.sock`. Every CLI call and the supervisor use that same
socket, irrespective of Docker contexts. TCP/SSH `DOCKER_HOST` is not used.

Headless safety acceptance uses the default image; the optional graphical image
has a separate result and positive Screen case. Unavailable graphical acceptance
is recorded explicitly and never counted as a passed Screen test.

The gate starts the supervisor from source on a free loopback port with a random
dedicated token and temporary private state. It runs
`packages/providers/tests/computer/conformance.test.ts` with `RAYPX_TEST_DOCKER=1`,
then provisions its own probe computer through the supervisor. Engine inspection
and in-container probes check UID 1000, absent Docker sockets, read-only root,
configured memory/PID ceilings, zero effective capabilities, no-new-privileges,
the owned bridge network rather than host networking, and no bind mounts. A
snapshot followed by a greater generation must create a different container and
preserve a written home file.

`--with-egress` additionally applies [the operator ruleset](deployment.md#optional-computers)
when running on Linux as root or with passwordless `sudo`. The Engine bridge must
exist on that host and Docker must use its iptables backend; both `iptables` and
`ip6tables` are required. The probe compares public `1.1.1.1:443` with an independent
Engine-host control; network failure on both is unavailable. TLS or HTTP errors
fail acceptance. Bridge gateway TCP/80 and `169.254.169.254:80` must time out;
refused connections or routing errors alone cannot prove these restrictions. These bounded checks do not demonstrate
every private address/port is blocked; the static ruleset test covers generated
ranges. Public IPv6 is denied by the ruleset. Without the flag, or on a host without
the supported OS/privilege combination, egress probing is reported as not run. A
supported opted-in apply/probe failure fails the gate. macOS/Colima firewall rules
belong inside the Linux Engine VM. Set `--engine-host-command` to an explicit
JSON argv prefix for root commands there, with the checkout mounted at the same
absolute path. Apply, counter reads and removal all use that prefix. The gate
owns a host-network canary for loopback and service isolation, independent of the
supervisor location. `--dns-resolver` selects the shared public IPv4 upstream.
Both direct and embedded UDP/TCP DNS are checked; alternate resolvers, metadata
and RFC 1918 destinations require timeouts and increasing owned DROP counters.
IPv6 enforcement is unavailable without a reachable host control; a reachable
control additionally requires a timeout and increasing IPv6 DROP counter.

Every run uses a unique supervisor namespace and labels. On success, failure or
handled interruption, it stops the supervisor before removing only its labeled
containers, anonymous helper volumes, labeled home volumes, network, built image
and temporary state; it removes any firewall rules it attempted to apply.
Cleanup failures fail the gate. There is no global prune. An uncatchable process
or machine termination can leave resources; the run ID in evidence identifies
their exact labels for operator cleanup.

One line per step reports progress. `.artifacts/sandbox-hosting/<runtime>/<run>/` retains protected
logs, `commands.json` timings/exit codes and `results.json` with run identity,
platform, Engine version/architecture/API, resolved base digests, built image ID
and result. No token, command
environment or argv is recorded. Review raw test logs before sharing. Source-only
`verify` never invokes this gate. CI selects the Ubuntu job for sandbox sources,
Computer provider/conformance inputs and sandbox acceptance/deployment inputs,
or full/manual/tag plans. The artifact is uploaded on success or failure. A root
lockfile change or missing Git base alone does not request Docker acceptance.

On 2026-11-14 the gate passed on macOS arm64 with a Linux arm64 Engine VM
(29.5.2, API 1.54), under runc and runsc release-20261109.0: provider conformance
12/12 (six live, six reference) and eleven safety/input probes per runtime.
Separate runc graphical conformance passed (one live, one reference); runsc
graphical conformance had one live failure, one reference pass and ten filtered
cases. Its affected generation reports `GRAPHICAL_RUNTIME_UNAVAILABLE`.
Public HTTPS and configured direct/file-resolver UDP/TCP DNS
succeeded; private, metadata, gateway, host-service and alternate-DNS probes
timed out with increasing owned DROP counters. IPv6 enforcement was unavailable
because the VM has no usable IPv6 route. Native Linux distributions, amd64, Windows, other
Engine configurations and rootless acceptance remain unverified.
