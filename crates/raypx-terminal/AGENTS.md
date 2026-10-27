# raypx-terminal

Private PTY library and `raypx-terminal-host` companion executable, consumed by
CLI's explicitly configured Rust terminal adapter. CLI remains the execution
owner; neither Tauri nor this crate owns accounts, approvals or task persistence.

`TerminalHost` separates pure session snapshots/replay from live PTY resources.
Input and resize share one bounded actor queue. Detach removes an output
subscription, never the process; close/host shutdown terminate and drain it.
History and subscriptions are bounded. Slow subscribers disconnect and recover
with a fresh attachment snapshot rather than blocking PTY readers.

The private, versioned NDJSON protocol uses base64 bytes and reserves stdout for
responses/events. EOF shuts down owned sessions. Never print command arguments,
paths or terminal data as diagnostics. Do not import Tauri or duplicate task-domain
schemas. Runtime state is in memory; host crashes are not process recovery.

Tests belong in `tests/`. Run `cargo test -p raypx-terminal --locked` and
`cargo clippy -p raypx-terminal --all-targets --locked -- -D warnings`.
Real Windows PTY behavior requires the Windows CI job; macOS tests do not prove it.
