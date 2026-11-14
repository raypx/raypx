# Computer and remote tool adapters

- `./computer` owns the provider-neutral lifecycle, execution, bounded file and home
  port plus the offline virtual in-memory implementation. API's Computers service
  and Sandbox consume it. It never executes host commands. Optional `readFile`
  returns a bounded prefix and observed total size for member previews; memory
  and Docker implement it. Docker runs the fixed no-follow reader through private
  execution transport in the prepared computer image, never a shell or backend process.
- `./computer/docker` is the lazily selected supervisor HTTP adapter, consumed by
  API. Only Sandbox opens the Engine socket. Vendor details stay inside adapters.
- The optional `screen/startScreen/stopScreen/screenshot/input/streamScreen`
  Computer operations require the declared `screen` capability. Frames are bounded
  PNGs with dimensions and a sequence, at most four per second; iterators close on
  stop/replacement and observe cancellation. The memory adapter produces real
  deterministic PNG bytes and never invokes a host renderer or command. The
  Docker adapter uses only the private supervisor interface.
- `./testing/computer` is the runner-injected conformance suite consumed by Sandbox
  tests; it imports no test runner at runtime. Live conformance requires the explicit
  RAYPX_TEST_DOCKER=1 flag and a prepared supervisor/image; tests never build or pull.

`./mcp` is the remote MCP HTTP tool adapter. It lazily loads the official client
SDK and supplies bounded, DNS-pinned HTTP requests with per-request address and
redirect admission. It never runs stdio, third-party code, ambient credentials or
model authority. Callers own secrets, approval/effects and untrusted provenance.

`./openapi` validates bounded OpenAPI 3.x JSON/YAML and adapts selected HTTP
operations without executing document code. Both remote adapters use the private
HTTP-egress DNS/socket admission path. HTTP API calls pin the registered origin
and base path, reject every redirect, bound responses and reject credential echoes.

`./computer` also exports `createDeviceComputerProvider`, consumed by API's Run tool adapter. It delegates through an injected connector transport and never executes on the backend host. Device providers report `device-process`, unrestricted egress and no home transfer/snapshot or Screen capability. All host I/O remains in the outbound connector; backend approvals and effect receipts remain authoritative.

No local model/session process adapter or public core transport entry remains.
Run check/test and explicit provider conformance when selected.

Private commands support UTF-8 stdin. Device adapters separate protected values from ordinary command fields; remote adapters scrub call-local overrides before truncation. No protected value joins a catalog or stored credential.

Computer provision accepts optional trusted Space context. The supervisor requires
it for untrusted tenants and persists immutable ownership for quota admission.
Quota error codes are additive and preserved by the private HTTP adapter; no
Engine detail or credential enters lifecycle responses.
