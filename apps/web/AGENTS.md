# Web

Web is the Bun/TanStack Start client. Read the root instructions, DESIGN.md and
[architecture](../../docs/architecture/README.md) before changes. Agents is the
signed-in home at `/agents`. The public `/` landing and `/privacy` remain separate
from the application shell. Project/session/task editors, guest draft handoff,
Waiting and Automations have been removed from this renderer. Do not restore them.

## Routes and ownership

- `src/routes/(app)` composes the shared Agents workspace, Space routines/memory panels and device preferences. Every shell route declares `staticData.page`
  and an entry in `features/auth/access.ts`; the shell owns its title and page layout.
  `@raypx/agents/model` owns selection and conversation state; `/client` renders it.
  Agent drafts stay scoped by origin, account, Space and conversation. Restoring
  drafts or uncertain-send receipts never sends a message automatically.
  The shared workspace places its Space menu and New Agent action in sidebar slots;
  Space selection has no second page control. Its conversation-header computer
  indicator opens the shared lifecycle panel through the existing API client.
- The conversation header opens Space-scoped routines and memory. The earlier
  standalone account Memory route and its navigation have been removed.
- The `(app)` loader resolves account context through a router-owned QueryClient.
  `SessionBoundary` waits for confirmed sessions and shows retryable failures.
  Agents redirects confirmed guests to login with a validated return destination.
  A failed session check is never a signed-out result. Private route guards and
  live permission boundaries fail closed and discard another account's grants.
- `features/auth/client.ts` owns Better Auth; `features/auth/account.ts` forwards
  filtered SSR cookies to the API. Shared forms come from `@raypx/auth/client`.
  Auth adapters own navigation, callback URLs and session refresh. Default sign-in
  opens Agents; explicit allowlisted destinations survive every supported method.
  Logout clears private caches, returns to `/`, and preserves device preferences.
- Account/security settings open with `#settings/account`, `password`, `sessions`
  and `instances`; device categories include `preferences` and `diagnostics`.
  The overlay preserves its background route and search, pushes on open and replaces
  on category changes. Close returns to the background entry. Direct links clear
  only the hash. Unknown categories open nothing. Identity changes discard drafts.
  Private categories need a confirmed account and fresh `account.manage` access.
  Sessions/tokens stay in component memory; never render or persist their tokens.
  Linked providers, passkeys and authenticator setup use shared account/auth views.
- `(admin)` has an independent AdminShell at `/admin`, `/admin/users`,
  `/admin/settings` and `/admin/audit`. Guards resolve fresh account permissions;
  deployment administration never grants Space admission. Keep private queries
  account/origin-keyed. Users use server search, filtering, sorting and pagination;
  role changes require confirmation and prevent self-editing. Statistics distinguish
  unavailable reads from zero. Audit is read-only, cursor-paginated and uses UTC.
  Unknown outcomes stay unknown until confirmed by the server.
- The configuration center owns Site, Object storage and Email forms. Preserve
  drafts on errors/conflicts, with explicit discard/reload. Credentials are
  write-only and absent from responses. Public configuration remains lightweight.
- `/desktop-authorize` displays the account/computer before explicit approval and
  preserves its signed request through sign-in. API owns expiry and exchange.
  `/health` is process liveness and never calls API.

## Interface

Use `@raypx/blocks/shell`, existing UI primitives, neutral tokens and Tailwind.
The command palette searches available pages and settings, with no background
project/session reads. Account/admin entries remain permission-filtered.
The landing and auth layouts share `PublicHeader`, `PublicBackdrop`, original
logos and theme/language controls. Public examples are labelled and static,
show conversations only and never mount execution clients or private queries.
Hero trails/frame light pause offscreen/in hidden tabs; reduced motion is static.
The public logo palette stays decorative. The workbench remains neutral.

Auth uses one bordered 16px panel, a single column on narrow screens and numbered
phase-1 product facts alongside it above 1024px. Shared Auth owns fields, errors,
submission state and completion/recovery states. App layouts own gutters. Language
switching preserves credentials and return destinations. A Space's team computer
can be started and stopped; Agent tools, approvals and durable Run recovery remain unavailable.

## Boundaries and persistence

- Use only public package entries. Web imports no API, auth-server, database or
  mail implementation and duplicates no API behavior in server functions.
- Remote commands/reads use API contracts; PostgreSQL owns Agent state. The earlier
  device runtime remains elsewhere and is separate from this conversation client.
- SSR forwards Better Auth cookies only. Without them, skip private account RPCs.
  `VITE_API_URL` is fixed at build time; SSR needs a shared origin or API AUTH_DOMAIN.
- Never read `window`/`document` during render. Read URLs through the router.
- Device theme/locale use cookies and storage independently of account sessions.
  SSR negotiates the weighted Accept-Language list; hydrate the same ready catalog
  before restoring browser preference. Use the shared preference provider only.
- Compose handwritten package catalogs with private `dash`, `users`, `site`,
  `guest`, `desktopAuthorization` and `legal` namespaces. Infer types from English;
  update Chinese together. Jobs and Memory contribute the panel catalogs. English is static, Chinese lazy and SSR uses static
  catalogs. Run `bun run i18n:types` after changing messages.
- Optional statistics and errors default off separately. Defer the analytics SDK,
  clear identity on logout and exclude prompts, paths, files, URLs and credentials.
  Development diagnostics load lazily after hydration; production eliminates them.
  Report safe error codes, never arbitrary server diagnostics.

## Build and verification

Bun runs `bun --bun vp` with `vite.app.config.ts`; Nitro uses the Bun preset and
starts with `bun .output/server/index.mjs`. Application plugins stay out of Vitest.
Vite build regenerates `src/routeTree.gen.ts`; never edit it or run `tsr` manually.
Keep response framing/base/form CSP, HSTS, nosniff, Referrer/Permissions policies.
PWA starts at `/agents`; its worker passes GET documents through and provides a
bilingual network fallback without caching assets, API requests or private data.

Use colocated `*.test.ts` and `*.component.test.tsx`; shared fixtures live in
`tests/`. Pure/unit and happy-dom/component projects stay separate. Browser cases
live in `e2e/` and use `@raypx/e2e/testing`; they verify compiled SSR, not native
Desktop. Run `bun run --cwd apps/web check`, `test`, and repository `bun run verify`.
`bun run --cwd apps/web e2e -- agents.spec.ts` needs its owned backend fixture;
browser, PostgreSQL and packaged platform acceptance are separate gates.
