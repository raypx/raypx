# @raypx/providers

Private ports/adapters for server Computers and remote MCP, plus the retained CLI
provider harness until replacement. Backend Agent execution owns approval/effect
policy; adapters never grant authority. CLI owns its execution policy,
storage, process transport, files, credentials, SQLite and lifecycle. Never import
applications, authentication or database implementations. Export only explicit entries.

- `./core`: `ProviderSession`, injected `SessionFactory`, process start/transport ports and
  normalized `ConversationEvent`s. Completion is `Promise<void>` and means all session
  activity has drained, not a process exit code. Never require an executable for an SDK session.
- `./claude`, `./codex`: process adapters for the private stream-json and app-server
  protocols. Raw envelopes stay in these adapters; they depend only on `./core` and Core.
- `./pi`, `./pi/context`: the injected Pi SDK session, bounded SDK loop and transcript
  schema. `src/pi/**` uses Bun's Node-compatible surface and imports `@raypx/ai` or
  `@earendil-works/pi-agent-core`. Persist tool intent before effects and results before
  inference. Never replay unresolved effects or expose reasoning, tool arguments or raw
  errors as activity.

Each adapter owns a versioned definition for runtime kind, modes, approvals and model
selection; discovery supplies availability and execution validates capabilities.
Cross-adapter imports go through `src/core`; adapters never import each other.

`tests/helpers` holds the test-only host, transport fake and shared conformance suites;
runtime entries never import it. Keep fakes at the transport/SDK boundary, verify replaced
handles cannot emit or approve work, and that cancellation waits for transport/SDK drain.

Run this workspace's check and tests, CLI adapter/replay/provider tests, then repository verify.

- `./computer` owns the provider-neutral lifecycle, execution, bounded file and home
  port plus the offline virtual in-memory implementation. API's Computers service
  and Sandbox consume it. It never executes host commands. Optional `readFile`
  returns a bounded prefix and observed total size for member previews; memory
  and Docker implement it. Docker runs the fixed no-follow reader through private
  execution transport in the prepared computer image, never a shell or backend process.
- `./computer/docker` is the lazily selected supervisor HTTP adapter, consumed by
  API. Only Sandbox opens the Engine socket. Vendor details stay inside adapters.
- `./testing/computer` is the runner-injected conformance suite consumed by Sandbox
  tests; it imports no test runner at runtime. Live conformance requires the explicit
  RAYPX_TEST_DOCKER=1 flag and a prepared supervisor/image; tests never build or pull.

`./mcp` is the one remote HTTP tool adapter. It lazily loads the official client
SDK and supplies bounded, DNS-pinned HTTP requests with per-request address and
redirect admission. It never runs stdio, third-party code, ambient credentials or
model authority. Callers own secrets, approval/effects and untrusted provenance.
