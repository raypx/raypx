# Infrastructure

Infrastructure packages are private Bun workspaces discovered through `infra/*`
in the root manifest. Service composition roots declare `raypx.kind: app` and
provider configuration declares `tooling`. Each owns its dependencies, deployment
entry, lightweight VP task config and focused tests. Applications never import
another application, and product runtime never imports provider tooling.

Reuse the service contract in `@raypx/tooling/build/deployment` and application
Dockerfiles. Keep secrets and infrastructure state out of source control.
Provider-specific instructions live in each workspace's AGENTS.md.
