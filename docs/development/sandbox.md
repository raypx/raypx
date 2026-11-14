# Local computers and sandbox acceptance

`infra/sandbox` is the private Bun supervisor for the Docker Computer provider.
Only it opens an Engine socket. API/worker processes receive its private URL and
dedicated token, never Docker credentials or a socket mount. The Agent runtime
stays in the backend. Start with [local setup](getting-started.md).

## Engine and image

Provide a Linux Docker Engine with API v1.47+ through a Unix socket and a Docker
CLI. On macOS, Colima can supply that Engine. If testing egress inside its VM,
mount the checkout at the same absolute path:

```sh
colima start --runtime docker --mount "$PWD:w"
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
```

For a native Linux Engine, use `/var/run/docker.sock` or its explicit absolute
socket path. Do not assume the active Docker context selects the source
supervisor's socket. Windows and rootless Engine acceptance remain unverified.

Build the prepared image with verified manifest digests, without the `sha256:`
prefix in the two build arguments:

```sh
docker build -f infra/sandbox/Computer.Dockerfile \
  --build-arg BUN_IMAGE_DIGEST="$BUN_IMAGE_DIGEST" \
  --build-arg COMPUTER_BASE_DIGEST="$COMPUTER_BASE_DIGEST" \
  -t raypx/computer:prepared .
docker image inspect --format '{{.Id}}' raypx/computer:prepared
```

The bases are the pinned Bun image and `python:3.13-slim-bookworm`. Use the
returned immutable `sha256:…` image ID or a preloaded repository digest for
`SANDBOX_COMPUTER_IMAGE`; mutable tags are rejected. Provisioning never builds or
pulls an image. The computer includes Bun, Python, git, coreutils and a shell.

## Run the source supervisor

Copy `infra/sandbox/.env.example` to `infra/sandbox/.env.local`, keep it private,
and supply these settings:

| Setting                                                           | Value                                                                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SANDBOX_LISTEN_ADDRESS`, `SANDBOX_PORT`                          | `127.0.0.1`, `4020` for a same-host backend. An explicit private IP is required.               |
| `SANDBOX_SUPERVISOR_TOKEN`                                        | Dedicated random secret of at least 32 characters; never reuse another application credential. |
| `SANDBOX_ENGINE_SOCKET`                                           | Absolute Unix socket; for Colima, the expanded path under the user's home.                     |
| `SANDBOX_STATE_DIRECTORY`                                         | Absolute private writable directory, unique to this supervisor.                                |
| `SANDBOX_COMPUTER_IMAGE`                                          | Immutable image ID/digest prepared above.                                                      |
| `SANDBOX_NAMESPACE`                                               | Stable namespace for this environment's network/volumes.                                       |
| `SANDBOX_MEMORY_BYTES`, `SANDBOX_NANO_CPUS`, `SANDBOX_PIDS_LIMIT` | Defaults: 536870912, 1000000000 and 128.                                                       |
| `SANDBOX_DNS_RESOLVER`                                            | Public IPv4 upstream, default `1.1.1.1`.                                                       |

Environment files are literal; expand paths yourself rather than writing `$HOME`
in their values. Keep one supervisor per state directory. Generation tombstones
and immutable home snapshots live there and must survive restarts.

```sh
bun --env-file=infra/sandbox/.env.local infra/sandbox/src/main.ts
```

In the backend's protected root environment, set:

```dotenv
COMPUTER_PROVIDER=docker
SANDBOX_SUPERVISOR_URL=http://127.0.0.1:4020
SANDBOX_SUPERVISOR_TOKEN=<the same dedicated secret>
```

Restart backend processes after changing their configuration. `COMPUTERS_PER_SPACE`
and `COMPUTERS_PER_MEMBER` default to 1 and 10; stopped homes still count. Open an
Agent's computer panel and Start, or let an approved tool lazily start compute.
File browsing is bounded and never starts a stopped computer. Containers run as
UID 1000, with read-only root, bounded resources, no capabilities or host mounts,
and their own durable home. Homes survive replacement with generation fencing.

## Restricted egress

Container isolation alone does not enforce network egress. The supervisor reports
unrestricted egress until both `SANDBOX_RESTRICTED_EGRESS=true` and
`SANDBOX_HOST_RULES_APPLIED=true` are backed by installed Engine-host rules.
Setting flags is not proof of enforcement.

[Deployment's optional-computer procedure](deployment.md#optional-computers)
describes deriving the bridge from `SANDBOX_NAMESPACE`, reviewing
`infra/sandbox/egress.sh --dry-run`, applying the rules on the Linux Engine host,
then enabling the two flags. On Colima, the Engine host is the VM. Use the same
public resolver in the supervisor and `egress.sh --resolver`. Rules preserve public
IPv4 HTTPS and that DNS upstream, block private/metadata/host destinations and
alternate direct DNS, and deny IPv6 egress. Removing rules requires clearing the
reported enforcement state. Do not claim restricted networking from flags alone.

## Owned real-Engine gate

```sh
bun run test sandbox --engine-socket "$HOME/.colima/default/docker.sock"
# Explicit opt-in to temporary firewall changes inside this Engine VM:
bun run test sandbox \
  --engine-socket "$HOME/.colima/default/docker.sock" \
  --with-egress --dns-resolver 1.1.1.1 \
  --engine-host-command '["colima","ssh","--","sudo","-n"]'
```

Native Linux can omit the VM prefix and use `--with-egress` with root or
passwordless sudo. The gate builds its own image, owns a temporary supervisor,
runs provider conformance, isolation and home-replacement probes, and cleans only
its labeled resources. No operator supervisor or database is needed. The egress
variant checks public controls, configured/alternate DNS, a host-service canary,
private ranges and metadata with owned DROP-counter evidence. Public connectivity
failure in both probe and control is unavailable; IPv6 needs a reachable control.

Evidence goes to `.artifacts/sandbox/`. See
[validation details](validation-artifacts.md#owned-sandbox-real-engine-acceptance)
for prerequisites, cleanup and recorded platform limits. Default source tests
inject an Engine transport and never mutate firewall rules. A passing VM IPv4 gate
does not establish IPv6, Windows, rootless or another Engine's acceptance.
