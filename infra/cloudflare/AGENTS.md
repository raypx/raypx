# Cloudflare Relay ingress

Cloudflare Workers + Containers adapter for the existing Bun Relay image. Only
the managed edge entry runs in workerd with nodejs_compat; Bun owns local tools,
tests/builds and the container runtime. Metadata target node expresses the SDK's
Node-compatible surface. Do not import another application's source.

Use one fixed named container with a bounded instance count. Forward only the
Relay ingress, preserve WebSocket upgrade responses, strip session/auth headers,
and keep first-frame authentication in Relay. Do not retry uncertain requests.
Only the three explicit Relay secret bindings enter the container; never expose
API cookies, AUTH_SECRET or provider credentials. PostgreSQL and Redis must be
externally reachable with verified TLS. Migrations stay with API.

VP builds the Worker; Wrangler consumes its bundle and the existing Relay
Dockerfile with repository-root context. Keep all state, .dev.vars and generated
configs ignored and excluded from Docker context. Tests live under tests/.
Docker/real Cloudflare acceptance is separate from source checks and dry-run.
