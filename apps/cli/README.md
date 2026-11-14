# Device CLI

The bundled CLI provides outbound device pairing, connector daemon control and
Desktop's private session bridge. Agent execution, conversations, approval policy
and routine scheduling belong to the backend.

Run `bun run --cwd apps/cli dev --help` for the current commands. `device pair`
and Space directory grants require local confirmation; unattended acceptance is
refused. The connector has no server listener. Use private temporary data homes
for tests and never inspect a user's configuration or credentials.

Desktop launches the compiled CLI by absolute path and keeps native/renderer
channel capabilities separate. Its only local runtime request is `runtime.info`.
See [Desktop](../../docs/development/desktop.md) and
[device connector](../../docs/development/device-connector.md).

`bun run build:cli` produces one immutable format-2 payload. `RAYPX_CLI_PAYLOAD`
selects that prepared directory for archive/Desktop consumers. Run `check`,
`test` and `smoke` in this workspace; smoke requires the prepared payload.
No terminal helper, model harness, enrollment, SQLite Agent profile, local task
router or service installer remains. Unsupported inventory versions are rejected.
