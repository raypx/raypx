# @raypx/pages

`/server` owns Space-scoped Page/version/share-link service ports, text tools and
sandboxed HTML rendering. `/server/postgres` owns transactional persistence.
Bounded Markdown or self-contained HTML bodies are immutable PostgreSQL versions;
every edit uses expected-version CAS. Run writes carry current execution fences
and mutation identities. Share tokens are returned once; only digests persist.
No Page content or token enters events or logs. API owns fresh membership and HTTP
admission. Public rendering never resolves a session. Both rendering routes must
preserve the restrictive sandbox CSP, no-store and no-cookie response contract.

Run `bun run --cwd packages/pages check`, `test`, and `test:postgres` separately;
PostgreSQL requires a disposable `*_test` database.
