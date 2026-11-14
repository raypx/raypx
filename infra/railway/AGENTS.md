# Railway application infrastructure

Manage only the named raypx-app partial in the linked Raypx production project.
Existing Postgres, Redis and volumes are operator-owned resources outside this
partial. Do not import them into application ownership or remove their storage.

Runtime variables are unmanaged. Keep secret values on Railway, preserve reference
variables and never print decrypted variables in logs or source. Gateway supplies
one public HTTPS origin. API, Web and databases use private networking.

This private Bun tooling workspace exports `railway.ts`. Keep the Railway SDK
and CLI dependencies here, with versions in the root development catalog.
`plan` and `deploy` explicitly select that file and use `scripts/iac-preload.ts`;
both must remain uncached. Review the plan before applying. Keep one API replica
with the combined backend role and route `/device/connect` and `/device/*` to it through Gateway.
Keep Wait for CI enabled and Watch Paths empty for the canary application services
so a later push can deploy changes from an unsuccessful run.
Preserve the separate Compose runtime and migration image targets. API's default
deploy target includes pre-deploy migration dependencies.

Keep tests beside the infrastructure entry and independent of credentials or live Railway state.
Run `bun run --cwd infra/railway check` and `test`, then root `bun run verify`.
See `docs/development/railway.md` for operator commands.
