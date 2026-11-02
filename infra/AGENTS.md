# Infrastructure

Infrastructure packages are private Bun workspaces discovered through `infra/*`
in the root manifest. Each owns its provider dependencies, deployment entry,
lightweight VP task config and focused tests. Declare `raypx.kind` and
`raypx.target`; keep infrastructure tooling outside application runtime imports.

Reuse the service contract in `@raypx/tooling/build/deployment` and application
Dockerfiles. Keep secrets and infrastructure state out of source control.
Provider-specific instructions live in each workspace's AGENTS.md.
