# @raypx/pages

`/server` owns Space-scoped Page/version/share-link service ports, text tools and
sandboxed HTML rendering. `/server/postgres` owns transactional persistence.
Bounded Markdown or self-contained HTML bodies are immutable PostgreSQL versions;
every edit uses expected-version CAS. Run writes carry current execution fences
and mutation identities. Share tokens are returned once; only digests persist.
The Page update tool accepts exact replacements against one saved version for
localized changes. All replacements match uniquely and commit as one version.
The form tool saves a confirmed text-field draft for the initiating member and
the current HTML version. The member document applies this draft at render time
while source, history and public links continue to use the immutable version.
No Page content or token enters events or logs. API owns fresh membership and HTTP
admission. Public rendering never resolves a session. Both rendering routes must
preserve the restrictive sandbox CSP, no-store and no-cookie response contract.
Creation writes a body-free same-Space `page_identities` tombstone transactionally;
Page deletion retains it for historical tool activity while removing content/links.
Markdown documents inline neutral light/dark styles authorized by their exact CSP
hash, with scripts denied. HTML documents preserve their authored bytes and
existing opaque-sandbox script/style policy. Pass the document kind to
`pageResponseHeaders` when serving either route. Markdown permits base64 raster
images (PNG/JPEG/GIF/WebP), never SVG data or data links.

Run `bun run --cwd packages/pages check`, `test`, and `test:postgres` separately;
PostgreSQL requires a disposable `*_test` database.

`/model` owns Page editing, expected-version conflict/draft transitions and
one-time link memory. `/client` renders the Space Pages directory and sandboxed
backend document frames; it never injects Page HTML. Web and Desktop inject the
session RPC port, Space events, account labels and conversation navigation.
The directory gets current author attribution in its bounded list response and
reads document bodies only for an opened Page. Its loading view shares the
toolbar, list surface and responsive row geometry with the directory.
A missing selected Page shows the translated deleted state and a return to the list.
The mount must supply `canEmbedAuthenticatedDocuments`: Web passes true and
Desktop passes false in both browser and packaged builds. Desktop offers a Web
handoff; source editing and safe Markdown source preview remain available.
The chat Page preview renders in a sidebar on wide screens and a sheet on narrow
screens. A result reads the recorded version and its predecessor on open. A Page
link opens the latest version. The preview renders Markdown in both clients,
sandboxed HTML on Web and HTML source on Desktop. Comparison uses saved source.
Web lets users open the preview or latest detail in a standalone tab through the
member document URL, which requires current Space membership.
`/messages/en` and `/messages/zh` own the `pages` catalog. Dirty source retains
its original comparison version on live updates; loading latest is explicit and
keeps the draft. Shared URLs exist only inside an open sharing dialog; closing
invalidates pending creation and clears them. Component suites are happy-dom;
PostgreSQL and browser sandbox checks remain separate acceptance gates.

Member-facing author and maintainer labels use supplied names or translated fallbacks;
opaque account/Agent identifiers remain selectors and never replace missing names.

List/version/share dates show localized minutes without seconds; time elements keep
the exact ISO instant and a full timestamp tooltip.

Ask about a Page restores the existing member-content Markdown reference in the
Agent draft. Agents owns its chip presentation and resolves the current title
through the authorized Page read. Successful Page tools return a Page detail
`pageUrl` built from the public Web origin injected by API.

Document and share URLs use /api/pages/member and /api/pages/public. Ask references use the member URL; old stored references remain plain text.

Web/Desktop Pages consume `useWorkspaceContext` from the persistent Agents layout.
A Pages route renders only its own feature content and keeps the selected Space in
search parameters; it must not construct a second AgentsWorkspace or sidebar.
