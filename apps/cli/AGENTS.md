# Device CLI

The CLI owns the outbound device connector and Desktop's private session bridge.
It owns no Agent execution, task router, model configuration or enrollment.
`device` handles pairing/status/start/stop/grants/native consent; `daemon` handles
the independent Desktop session service and finite bootstrap. Never expose private
native methods or administrative tokens to the renderer.

Connector state, operation journal and outbox live in restricted `connector.json`
storage. Pairing and every Space directory require native or interactive local
confirmation. Bind credentials to account/origin, fence every operation and fail
closed on membership/grant/revocation changes. Commands require approval or an
exact executable Allow; Auto never approves device commands. No listener or local
Agent harness is published by the connector.

The Desktop daemon uses authenticated private IPC and a distinct bounded loopback
WebSocket channel for each renderer. Its only local runtime method is
`runtime.info`. It verifies browser OAuth consent, PKCE/state/issuer and the current
account. Cookies remain in encrypted `desktop-session.sqlite`, never model or
renderer state. This database contains only desktop_sessions; old profile.sqlite
is never opened or imported. Session reset changes only this storage. Keep native
and renderer capabilities separate, exact Origins, one-use authentication, ACK
limits, deadlines and account/origin cleanup. Sign-out revokes connector binding.

Tests and daemons always use private temporary homes/data directories. Never read
user configuration, cookies or credentials. Build once using the pinned Bun
runtime: format-2 payload is executable, runtime.json and legal files. Reject
unsupported inventories. Consumers verify RAYPX_CLI_PAYLOAD and never rebuild or
rewrite sealed files. Run check/test and prepared-payload smoke; real connector
PostgreSQL, Go host and packaged native gates remain separate.

Protocol 2 protected command environment/stdin values remain process-local. Scrub raw/escaped/common encoded echoes before emit touches the outbox. Receipt hashes include destination metadata only; unknown operations never replay. Connector-state writers wait at most one second for local contention; owner locks remain immediate.

Only the separate device connector handles expiring member-read frames. It
validates local owner/grant/fence and uses no-follow descriptors for read-only
browsing. Generated inbox parents are restricted to Run/attachment UUID paths
inside the granted root. Connector receipts grant no Agent execution authority.
