# Raypx terminal host

Private Rust PTY host for the local Raypx CLI. It uses `portable-pty` and is
independent of Tauri, accounts and task-domain schemas. The ownership model was
informed by [herdr](https://github.com/herdrdev/herdr/tree/2713feb56e9c9db33992db0a262c68f7426d46dd);
this is an independent implementation, not vendored herdr source.

Build and opt in from the repository root:

```sh
cargo build -p raypx-terminal --locked
export RAYPX_TERMINAL_HOST="$PWD/target/debug/raypx-terminal-host"
bun run dev:desktop
```

On Windows, use the absolute `target/debug/raypx-terminal-host.exe` path. The
existing CLI remains usable without Rust or this setting. The adapter starts the
companion lazily for terminal operations; an explicitly selected but incompatible
host fails instead of silently falling back. Shipping it as the default Desktop
companion is a separate packaging decision.

The host owns PTYs; its `TerminalHost` library offers `open`, `list`, `snapshot`,
`attach`, `detach`, `write`, `resize`, `close`, and `shutdown`. Metadata and bounded
replay are separate from child handles and I/O workers. Detaching never kills a
session. Each session has one active attachment; a fresh attachment supersedes
the old one, and its snapshot/replay and subscription are captured atomically.
Slow attachments disconnect instead of blocking the terminal reader. Reattachment
returns the bounded retained suffix and whether older output was truncated.

The companion accepts private version-1 NDJSON requests on stdin. Methods are
`hello`, `open`, `list`, `attach`, `detach`, `input`, `resize`, and `close`.
Request IDs correlate responses; byte payloads are base64. Output/exit events carry
a session-local sequence. Input and resize use one bounded serial queue. A write
timeout means delivery is uncertain and must never be retried automatically.
EOF terminates and drains owned sessions. This is in-memory ownership, not crash
recovery, a terminal screen parser or a provider protocol adapter.

The initial CLI integration preserves its existing terminal lifetime: terminal
close and the owning client/CLI shutdown cancel its terminal sessions. Managed
Agent tasks keep their existing independent daemon, approvals and durable journal.

```sh
cargo test -p raypx-terminal --locked
cargo clippy -p raypx-terminal --all-targets --locked -- -D warnings
RAYPX_TERMINAL_HOST="$PWD/target/debug/raypx-terminal-host" bun run --cwd apps/cli smoke:rust-terminal
```

Tests use owned temporary directories and local shells, never live coding agents.
Windows ConPTY behavior needs its own native CI acceptance.
