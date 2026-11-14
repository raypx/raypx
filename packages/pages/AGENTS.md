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

`/model` owns Page editing, expected-version conflict/draft transitions and
one-time link memory. `/client` renders the Space Pages directory and sandboxed
backend document frames; it never injects Page HTML. Web and Desktop inject the
session RPC port, Space events, account labels and conversation navigation.
The mount must supply `canEmbedAuthenticatedDocuments`: Web passes true and
Desktop passes false in both browser and packaged builds. Desktop offers a Web
handoff; source editing and safe Markdown source preview remain available.
`/messages/en` and `/messages/zh` own the `pages` catalog. Dirty source retains
its original comparison version on live updates; loading latest is explicit and
keeps the draft. Shared URLs exist only inside an open sharing dialog; closing
invalidates pending creation and clears them. Component suites are happy-dom;
PostgreSQL and browser sandbox checks remain separate acceptance gates.
