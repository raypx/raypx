# Computers, the supervisor and device connectors

A computer is the place where a Run's tools execute. It is durable: its home
survives a stopped, restarted or replaced container. The Agent runtime stays
outside it.

```text
Run (Pi, in the backend) -> computer tools -> Computer port -> docker | hosted | device
```

## The Computer port

A provider implements:

- **Lifecycle**: provision or reconnect, stop and destroy.
- **Execution**: executable, argv and cwd; a stream of process events; cancellation
  of one Run's work.
- **Files**: bounded list, read and write inside the workspace.
- **Home**: export, import and snapshot of the persistent home.
- **Description**: the capabilities it has and the limits it cannot enforce.

The port and its adapters live in `@raypx/providers`. A vendor SDK loads only when
its provider is configured. Graphical desktops, browser tools, screen streaming
and user takeover extend the same port in a later phase.

## Providers

| Provider | Runs on                        | Boundary                                   | Started by         |
| -------- | ------------------------------ | ------------------------------------------ | ------------------ |
| `docker` | The supervisor's Docker Engine | The container                              | Sandbox supervisor |
| hosted   | One hosted sandbox service     | The provider's sandbox                     | Backend            |
| `device` | A registered device            | Granted directories; the user's OS account | Device connector   |

One conformance suite runs against an in-memory provider and every real provider.
It covers lifecycle, execution, cancellation, bounded files and home persistence
across a replacement.

## Team and private computers

- A Space has one team computer by default. Its Agents share files and installed
  tools. Each Agent starts in its own folder; deliberately shared work goes in a
  shared folder. The folders organize work. They are not a security boundary.
- An Agent can use a private computer when its files must stay apart from the
  other Agents in the Space.
- The container is the security boundary. Work that must be isolated from other
  members needs its own Space.

## Lifecycle and leases

- A computer starts when a Run first needs it and stops when idle, so configured
  capacity does not become reserved memory.
- Every lifecycle operation carries a generation. An older generation cannot write
  the home or accept commands after a replacement.
- A Run holds an execution lease on its Agent's computer use. The lease has an
  expiry and a fence. One Agent has one driver at a time; different Agents on a
  team computer run concurrently.
- A Run's computer is fixed when the Run first starts. An unavailable computer is a
  waiting or failed state. A Run never moves to another computer by itself.

## Homes

- The home is a volume the supervisor owns, mounted into the container.
- A snapshot records a home revision. Stop commits a snapshot. A replaced
  container restores the latest one.
- A snapshot can be copied to object storage for backup and for moving a computer
  between hosts. This is optional.
- A failed restore keeps the last known-good revision and reports the failure. It
  does not start from an empty home.

## The sandbox supervisor

The supervisor is a separate service under `infra/sandbox`.

- It alone holds the Docker socket. Access to the socket is control of the Docker
  host, so the backend never mounts it.
- It listens on the private network only. The backend calls it with a dedicated
  token that is distinct from every other secret.
- It applies memory, CPU and process ceilings to each container. A malformed limit
  fails the supervisor at startup and names the setting.
- Deployment settings cap computers per member and per Space.
- With restricted egress, a container reaches the public internet but not the
  Docker host, the local network or cloud metadata addresses. This needs a host
  ruleset. Where it is not applied, the supervisor reports egress as unrestricted.
- The computer image is built from this repository and pinned by digest.

## Device connectors

The device connector is the bundled CLI daemon. It offers the device it runs on as
a computer.

- It opens an outbound WebSocket to the backend's `relay` role. It exposes no
  inbound listener.
- A device is registered to one account. A device grant lets one Space use selected
  directories on it. Granting asks for native confirmation on the device.
- Each command carries an immutable identifier, a payload hash and the current
  grant revision. The connector checks its local grant on every command and
  journals what it accepts. A retry uses the same identifier.
- Connector events carry an increasing sequence. Reconnect resumes from the
  acknowledged cursor.
- Revoking a grant, signing out or resetting the password ends access and cancels
  the work in flight. An in-flight effect with an unknown result is marked
  uncertain.
- A device runs only Runs started by the member who granted it, and never Runs
  started by a routine trigger from outside or by another member's message.
- An offline device is a waiting state.

Commands on a device keep the user's OS permissions. The grant limits scope; it is
not sandbox isolation. The product says so where the grant is given.

## Secrets in a computer

- Model credentials, sessions and connector tokens never enter a computer.
- A command that needs a secret receives it for that command only, through the
  process environment or standard input. It is not written to the home.
- Output that returns to the model is bounded. A known secret value in output is
  redacted before it reaches the conversation.
