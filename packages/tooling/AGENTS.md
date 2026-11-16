# Build helpers

Build-only exports /build/nitro, /build/deployment, /build/analytics,
/build/start-env, /build/cli and /build/release serve established application and
Dev CLI consumers. No product runtime imports this package. Turbo owns scheduling;
Dev CLI owns commands and reusable validation. No browser-server or performance
entry exists. E2E owns its compiled Desktop fixture server.

Deployment apiIngress declares one /api/ prefix and only the two discovery
and two platform-probe root exceptions. Static adapters must match without
importing application runtime or loading environment files. API source tests and
production startup reject undeclared root mounts. CLI
payload format 2 is immutable, version-pinned and has no terminal helper. Verify
prepared inventories before use; never build implicitly. Run check/test/policy.
