# Desktop Rust cloud oRPC

The native host uses `orpc` and `orpc-client` 1.1.0 for cloud calls from
`Api::rpc`, including account verification and `hosts.authorize`/`hosts.revoke`.
`orpc_client.rs` composes the upstream typed
[`Client::with_link`](https://github.com/ahonn/orpc-rs/blob/edeb398d077dc850ca38895737f898f148cf9bf6/crates/orpc-client/src/client.rs)
with Raypx's `NativeApiLink`. Renderer IPC and its acknowledged event Channel
keep their existing transport. Rust forwards business payloads as `serde_json::Value`;
TypeScript contracts remain the schema source.

## Native transport boundary

Every custom Link request enters `Api::request_internal` with native permission.
That preserves the configured origin and path allowlist, `Origin: views://main`,
request header/body limits, the 30-second deadline, cancellation accounting,
8 MiB response limit, redirect refusal and atomic native Cookie batches.
Host credentials go directly to CLI coordination and never enter renderer responses.

The upstream
[`RpcLink`](https://github.com/ahonn/orpc-rs/blob/edeb398d077dc850ca38895737f898f148cf9bf6/crates/orpc-client/src/rpc_link.rs)
uses its own HTTP request path and reads the full response body. Supplying a
custom reqwest client alone would bypass Raypx's Cookie and policy handling.
Raypx therefore supplies a `Link` rather than using `RpcLink::with_client`.
Upstream dependencies enable reqwest's native TLS feature during compilation;
Raypx explicitly selects `use_rustls_tls()` for its actual HTTP client.

## oRPC 2 compatibility

The wire adapter supports ordinary JSON requests and responses. Current Raypx
contracts represent protocol dates as strings. Nonempty `meta`, `maps` or `blobs`
are rejected; Rust does not interpret oRPC 2 Date/BigInt metadata or subscriptions.

TypeScript oRPC 2 error JSON omits the `status` field required by orpc-rs 1.1.0.
The adapter supplies the authoritative HTTP status before decoding the upstream
`ORPCError`. Native diagnostics use a fixed error-code mapping and never forward
server error messages or data.

| Response                       | Native result                 |
| ------------------------------ | ----------------------------- |
| HTTP 401 / oRPC `UNAUTHORIZED` | `AUTH_REQUIRED`               |
| Valid oRPC 404 `NOT_FOUND`     | `NOT_FOUND`                   |
| Plain or malformed HTTP 404    | `MISSING_PROCEDURE`           |
| oRPC `FORBIDDEN`               | `FORBIDDEN`                   |
| HTTP redirect                  | Rejected without following it |

`Control::attach` selects the older server's `host.legacy` path only for
`MISSING_PROCEDURE`. Authentication failures and valid oRPC errors cannot trigger
that downgrade.

## Verification

Prepare a clean checkout with the repository-pinned Bun and Rust toolchains:

```sh
bun install --frozen-lockfile
bun run build:desktop
bun run build:cli
bun run --cwd apps/desktop tauri:generate
bun run --cwd apps/desktop tauri:cli
cargo test -p raypx-desktop --locked --test orpc_cloud --test policy
```

`orpc_cloud.rs` starts the actual `@orpc/server` 2.0.0-beta.46 router in
`tests/native/fixtures/orpc-server.ts` using Bun on an ephemeral loopback port.
It verifies account/authorize/revoke calls, native Cookie handling, renderer
credential boundaries, status-less errors, legacy 404 fallback, redirects and
unsupported metadata. It needs no database, GUI, deployed API, provider login or
paid inference. The fixture process is terminated when the test ends.

Desktop CI installs Bun with `oven-sh/setup-bun` before Cargo tests and inherits
that `PATH`. The test resolves Bun to an absolute executable and checks its version
against root `packageManager`. `RAYPX_BUN` can explicitly select an absolute Bun
path when needed; it must match the same pin.

Local macOS validation on 2026-10-27 passed the cross-language test and all 18
policy tests. The separate ignored lock probe is invoked twice by its parent test
to verify cross-process exclusion and release. Windows execution remains a CI gate;
loopback protocol checks do not establish production HTTPS session acceptance.
