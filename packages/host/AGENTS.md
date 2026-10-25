# @raypx/host

## Purpose

Shared Bun-only outbound remote-control transport for the CLI daemon and the
legacy Desktop host. Domain schemas remain in contracts; execution stays in CLI.

## Interface

Public exports are `RemoteControl`, `ControlInfo` and `serverOrigin`. Inject the
local engine, credential renewal, notifications and optional observed-session
projection/acknowledgement callbacks. Protocol 2 remains the managed-only fallback;
protocol 3 adds terminal requests. Renderer code imports pure types from contracts.

## Constraints

Never import applications, browser authentication or provider credentials. Keep
replay, command receipts, connection fencing and bounded renewal/backoff behavior.
Only explicit detach cancels execution; a daemon client's disconnect is not detach.
Validate remote origins and keep secrets out of disk settings and diagnostics.

## Verification

Run `bun run --cwd packages/host check`; transport regression tests currently live
in Desktop's `tests/native/control.test.ts` and daemon integration tests in CLI.
