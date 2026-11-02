# Railway application infrastructure

Manage only the named raypx-app partial in the linked Raypx production project.
Existing Postgres, Redis and volumes are operator-owned resources outside this
partial. Do not import them into application ownership or remove their storage.

Runtime variables are unmanaged. Keep secret values on Railway, preserve reference
variables and never print decrypted variables in logs or source. Gateway supplies
one public HTTPS origin; API, Web, Relay and databases use private networking.

This private Bun tooling workspace exports `railway.ts`. Keep the Railway SDK
and CLI dependencies here, with versions in the root development catalog.
`plan` and `deploy` explicitly select that file and use `scripts/iac-preload.ts`;
both must remain uncached. Review the plan before applying. Keep one API and one Relay replica and preserve the separate
Compose runtime/migration image targets. Use the shared apps/api and apps/web
Dockerfiles; API's default deploy target includes pre-deploy migration dependencies.

Keep tests beside the infrastructure entry and independent of credentials or live Railway state.
Run `bun run --cwd infra/railway check` and `test`, then root `bun run verify`.
See `docs/development/railway.md` for operator commands.
