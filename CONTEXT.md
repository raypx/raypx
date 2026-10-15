# Raypx context

- Application: a composition root under apps, never imported by another workspace.
- Library: a private ESM package with explicit public exports and platform metadata.
- Tooling: development/test automation excluded from production import graphs.
- API: Node-hosted Hono/oRPC application composed by Nitro.
- Local engine: the bundled CLI process owned by Desktop, with device-local SQLite state.
- Root grant: an opaque identifier for an explicitly authorized local directory.
- Automation: a five-field Cron schedule with an IANA timezone and a local action.
- Terminal: an interactive process/PTY, stopped with its owning local engine.

Current [architecture](docs/architecture/README.md) supersedes [historical records](docs/history/architecture/README.md).
