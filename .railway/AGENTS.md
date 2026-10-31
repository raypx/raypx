# Railway application infrastructure

Manage only the named raypx-app partial in the linked Raypx production project.
Existing Postgres, Redis and volumes are operator-owned resources outside this
partial. Do not import them into application ownership or remove their storage.

Runtime variables are unmanaged. Keep secret values on Railway, preserve reference
variables and never print decrypted variables in logs or source. Gateway supplies
one public HTTPS origin; API, Web and databases use private networking.

Use the Bun-scoped IaC preload documented in docs/development/railway.md. Review
the plan before applying. Keep one API replica and preserve the separate
Compose runtime/migration image targets. Use the shared apps/api and apps/web
Dockerfiles; API's final railway target includes pre-deploy migration dependencies.
