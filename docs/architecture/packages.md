# Shared Packages

This document describes what each package is for and why its seam sits where it
does. Each package's own `AGENTS.md` owns its export surface, constraints, and
verification commands; keep those details there rather than duplicating them
here.

## `@voidmix/contracts`

The runtime contract seam. It contains Zod schemas, DTOs, and the oRPC contract
tree, but performs no network calls and exposes no database implementation.
Domain modules compose into one explicit contract tree. Shared helpers own
resource fields, cursor envelopes and validated procedures; `methods.ts` owns
HTTP method classification for both API and client. The public Auth capability
DTO contains only three booleans; settings administration RPCs are retired.

`cloud` defines the new conversation, Task/Run, immutable file, review, usage,
notification and preference protocol. It retains native `Date` DTO fields and
contains no Pi, Drizzle or S3 SDK types. Streams have independent connections.

## `@voidmix/application`

The application command/query layer shared by the API and Agent Worker. It
coordinates Identity, Projects, Assets, Reviews and Activity ports from Core.
ProjectAccess supplies narrow capability checks across domains. Application owns
workflow ordering and invokes the administration transaction port; DB implements
atomicity and authorized list queries. HTTP, SQL, React and provider lifecycle
remain outside Application. See [domain services](./domain-services.md).

The cloud application coordinates current personal/project authorization,
idempotent commands, owner-fenced execution, model reservations and atomic
revision publication. API and Worker both use this same execution model;
`cloud.run.queued` is distinct from historical delivery events.

## `@voidmix/ai`

The server-side AI adapter for Pi. It owns provider lifecycle, SDK-specific
session management, project tool registration, and conversion to stable
Voidmix run events. It receives canonical `ProjectApplication` commands and authenticated context
through dependency injection, never creates database connections, reads HTTP
sessions, or exposes Pi SDK types to API and Web consumers.

## `@voidmix/client`

The transport adapter. `createApiClient({ baseUrl?, headers, fetch })` returns a
typed client generated from the shared contract. Web and Desktop provide
an absolute API origin and send credentialed requests.

Framework-independent conversation/run sessions own replay, deduplication,
contiguous cursors and reconnects. Apps own session lifetimes by account and
resource; React reads the external store with `useSyncExternalStore`.

## `@voidmix/storage`

Server-only implementation of Core's object-storage port, shared by API and
Worker. It supplies private S3 transfers, signed bounded uploads, authorized
downloads and memory/filesystem test adapters. DB keeps metadata, never object
bytes or provider credentials. Frontend applications cannot import this package.

## `@voidmix/agent-ui`

Controlled business views for composing messages, research sources, execution
progress, tools and artifact review. Apps inject snapshots, actions and platform
capabilities. Local state covers focus, selection, expansion and following the
latest message; the package owns no transport or second copy of server facts.

## API server modules (`apps/api/server/api`)

The internal transport and composition modules of the standalone API app. They
own Hono routes, oRPC handlers, Better Auth session resolution, permission
enforcement, CORS, mail composition, dynamic authentication-policy enforcement,
and the pooled database runtime. They export process-scoped `ApiModules`,
request-scoped Auth context types, factories, and an environment preset, but do
not own the Nitro listener or process lifecycle.
Hono resolves one application session per RPC request; oRPC permission middleware
injects a non-null principal into protected handlers. Better Auth database IDs are
generated as UUID v7 values so
new records retain time-ordered locality while remaining globally unique.

## `@voidmix/cache`

The optional server-side Redis adapter provides JSON `remember` with TTLs and
raw-string Better Auth secondary storage. Atomic token consumption and rate
increments stay in Redis Lua scripts. API uses its atomic counter for cloud AI
admission; Better Auth sessions, verification and policy use PostgreSQL directly.
The adapter has no fallback store and no unused generic add/pull/flush facade.
Mail configuration remains database-backed.

## `@voidmix/shared`

The foundation shared by domain and adapter packages. It owns
the framework-independent `DomainError` envelope, setting source and mutation
value types, and injectable clock/ID interfaces with their default
implementations. Core re-exports these primitives for compatibility, while DB
consumes them directly so the dependency seam remains explicit.

The package also owns two framework-oriented subpath families while keeping
those dependencies isolated from the root and from each other:

- `@voidmix/shared/env` and `@voidmix/shared/env/runtime` compose and validate
  caller-supplied environment values. Applications still own their variables;
  this package never reads `.env` files. Blank strings normalize to `undefined`,
  defaults apply before validation, and browser access rejects server values.
- `@voidmix/shared/logger` and its `client`, `env`, `hono`, `orpc`, and `vite`
  subpaths configure Evlog, provide the central redaction policy, and expose
  optional surface adapters. Operational logs remain separate from durable
  audit records.

Public subpaths resolve to ESM and declaration files built in `dist/`. Zod and
Evlog are runtime dependencies; Hono, oRPC, and Vite are optional adapter peers.
The source remains the target for tests and type checks. Installation builds the
initial output, while the root development and verification commands refresh it.

## `@voidmix/core`

Framework-independent business rules and repository interfaces. Its single
public barrel is organized into bounded contexts:

- `identity` owns users, audit events, status transitions, and administrator
  protection.
- `settings` owns typed mail/Auth policy, source and inheritance rules, and
  public Auth capability derivation.
- `projects` owns the account-first V2 Project scope, ProjectMember roles,
  lifecycle, and centralized capability evaluator. V2 resources are modeled
  independently of Workspace and Project Studio.
- Task models live within `projects`; `assets`, `reviews`, `activity` and
  `agents` own their records and repository ports. Identity retains rules and
  audit construction while Application owns its workflows.
- `assets` retains the blob upload/download port and errors used by V2.
- `agents/outbox.ts` defines durable dispatch ports; Agent cancellation invariants
  live in `agents/runs.ts`. Retired Workspace, Project Studio, scheduled-task,
  asset-sync and legacy Agent implementations are removed.

These contexts remain one package until a second independent server consumer
creates a stable extraction seam. UI features under `apps/*/src/features` are
composition and presentation modules, not domain modules.

It does not import React, Hono, Nitro, or Drizzle.

## `@voidmix/auth`

The authorization vocabulary: roles (`user`, `admin`, `owner`), permissions,
session types, and `hasPermission`.

The role grants are explicit permission allowlists; adding a permission to the
vocabulary does not implicitly grant it to Admin or Owner.

The retired settings administration permissions are removed. Authentication
policy still controls registration and mail through API runtime guards.

`apps/api/server/api` owns the Better Auth adapter and production cookie
session resolver. The development header resolver remains available for
injected tests and local preview only; the oRPC router and core services do
not depend on the provider.

## `@voidmix/mail`

Typed mail delivery for verification, password reset, welcome and opt-in Task
notifications. Task templates cover review, failure, waiting input and completion
without including prompts or file content.
Verification and reset share a link template; typed senders share current
configuration resolution and delivery. The unused Admin test-mail method is removed.
Its JSON catalogs are rendered through the server-only `@voidmix/i18n`
translator using `MAIL_DEFAULT_LOCALE`, which falls back to English.
React Email templates always provide HTML and plain-text output. Resend is the
production transport; development and test use a logger transport without
network access. Production throws `MailUnavailableError` at delivery time when
configuration is unavailable, rather than failing process startup or silently
using the logger transport. The package exposes only server-side mail interfaces.

## `@voidmix/i18n`

The locale and translation facade shared by renderer and server packages. It
owns the supported locale list and native language metadata, `en`/`zh` normalization, Accept-Language and Cookie parsing, browser and
Desktop storage adapters, Intl formatters, the synchronous and asynchronous
React providers, and the internal `use-intl` integration. Applications and
Mail own their catalog files.

The package exposes a small catalog-loader type but no application-specific
loader or generated runtime output. Web uses the async provider with its own
explicit locale-to-import map; Desktop and Mail remain synchronous. Domain and
contracts remain independent of i18n.

## `@voidmix/db`

The database adapter package.

- Drizzle PostgreSQL schema lives in domain modules under `src/schema/`,
  exposed by the small `src/schema.ts` entrypoint.
- Identity, settings and V2 adapters live in separate domain directories.
  Historical table definitions and migrations remain reference material; the
  public runtime schema excludes the former local/legacy execution tables.
- V2 Project, organization membership, Task, Asset, Review, Feedback, Activity,
  cloud execution and outbox adapters implement Core ports. Turn/Task/Run
  creation and its outbox event use one PostgreSQL transaction.
- Blob storage remains available in memory and on the filesystem.
- `system_settings` stores typed ordinary configuration keys and
  `system_secrets` stores write-only secret values. Both record the updater and
  timestamp.
- Authentication policy reuses `system_settings`: registration mode, an exact
  email-domain allowlist encoded as JSON text, and the welcome, verification,
  and password-reset email switches. Only typed repository methods can access
  these fixed keys.
- Resolution is field-scoped. Database values override mail environment/default
  fallbacks; Auth values override built-in defaults. Omitted mutations retain a
  row, `set`/`replace` upsert it, and `reset` deletes it. Repository views include
  sources and safe inherited previews, while runtime resolvers omit that
  presentation metadata and retain server-only secret material.
- Audit targets distinguish `user` from `system_setting`. `actor_id` always
  references a user; the generated nullable `target_user_id` preserves a
  restrictive user foreign key while allowing `target_id = mail` for settings.
- The new runtime schema and migrations use `schema/cloud-baseline.ts` and
  `drizzle-cloud/`; historical `drizzle/` migrations remain reference material.
- Database tables and Drizzle details are not exposed to frontend apps.

`settings/reader.ts`, `values.ts` and `mutations.ts` share decoding, inheritance
and redacted audit semantics across memory and PostgreSQL. Authentication reads
policy at each decision, optionally through the short-lived Redis cache. Mail
resolves current configuration on each delivery; no process-lifetime cache exists.

## `@voidmix/ui`

Shared visual primitives and design-system utilities:

- Base UI interactive primitives.
- shadcn `base-nova` component conventions.
- Phosphor Icons for renderer surfaces.
- Tailwind CSS v4 variables and theme tokens.
- SSR-safe `ThemeProvider`, `ThemeScript`, and `useTheme` for light, dark, and
  system themes.
- Base-nova `Button`, `Badge`, `Avatar`, `Card`, `DropdownMenu`, and
  form components, plus the product-specific `Logo`.
- A lazy Toast manager bridge exposed through `@voidmix/ui/toast`; it loads the
  concrete Toast implementation only when the first notification is added.
- `cn`, CVA and `styledSlot` helpers for composition. Unconsumed Sidebar,
  Menubar, Sheet, Dialog, Tooltip, Skeleton and Separator trees are removed
  together with exclusive dependencies and regeneration entries.
- Shared base-nova semantic colors, focus, radius, and motion tokens from
  `packages/ui/src/styles/globals.css`.

Each renderer has a `components.json` that targets the shared UI package with
`style: "base-nova"`, `rsc: false`, and `iconLibrary: "phosphor"`. Page layout,
route trees, and product-specific visual composition remain in their owning
application so migration can happen incrementally.

Import generated UI primitives through their explicit
`@voidmix/ui/components/ui/<component>` subpath. The package root intentionally
does not re-export components so bundlers can tree-shake each primitive
independently. Product wrappers such as `Avatar` and `Logo` retain their own
top-level subpaths. Renderer applications that need deferred notifications use
`@voidmix/ui/toast`; the concrete Toast implementation remains available at
`@voidmix/ui/components/ui/toast` for direct UI-package tests and composition.

## `@voidmix/scripts`

A private Bun CLI for procedural repository automation. Vite+ owns the task
graph; Scripts owns operations that understand the repository or database.
Runtime applications must never import this package.

The existing `vmx` bin also exposes `vmx env -- <command>`. This
development/build runner uses Dotenvx's programming API to load root
`.env.local` and `.env` into a copied child environment, preserves the caller's
working directory and stdio, forwards termination signals, and avoids loading
the same files again in nested runner calls. The internal marker is scoped to
the repository root, remains a runner implementation detail, and is not part of
any business schema.

The Citty command tree is split into lightweight domain command modules so each
concern can be tested without bootstrapping the complete CLI: pure operations
accept injectable dependencies, renderers are separate from the data they print,
and command adapters stay thin. `packages/scripts/AGENTS.md` records the source
layout and the conventions new modules must follow.

Policy orchestration lives in `src/policy/checks.ts`, while workspace, manifest,
documentation, skill, and TypeScript rules live in injected modules under
`src/policy/checks/` and `src/policy/manifests/`. Splitting those rule domains
must not change `runPolicy` or its finding output. Findings, strict JSON parsing,
file traversal and CLI context setup use shared owner-local helpers.

The i18n checker separates catalog comparison, source inspection and reporting.
`oxc-parser` owns JSX/TypeScript syntax; FormatJS through the i18n testing subpath
owns ICU syntax, including plural/select branches and apostrophe quoting.

## `@voidmix/tsconfig`

Shared strict TypeScript presets. They define compiler behavior but never own
consumer `include`, `exclude`, `paths`, output directories, or project
references. See [Toolchain](./tooling.md) for the preset matrix.
