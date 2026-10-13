# Shared Packages

This document describes what each package is for and why its seam sits where it
does. Each package's own `AGENTS.md` owns its export surface, constraints, and
verification commands; keep those details there rather than duplicating them
here.

## `@raypx/contracts`

The runtime contract seam. It contains Zod schemas, DTOs, and the oRPC contract
tree, but performs no network calls and exposes no database implementation.
Domain modules compose into one explicit contract tree. Shared helpers own
resource fields, cursor envelopes and validated procedures; `methods.ts` owns
HTTP method classification for both API and client. The public Auth capability
DTO contains only three booleans; settings administration RPCs are retired.

`cloud` defines the conversation, Task/Run, immutable file, review, usage
and capability protocol. Task notifications and notification preferences are
retired. It retains native `Date` DTO fields and
contains no provider, Drizzle or S3 SDK types. Streams have independent connections.

## `@raypx/application`

The application command/query layer shared by the API and Agent Worker. It
coordinates Projects, Assets, Reviews and Activity ports from Core.
ProjectAccess supplies narrow capability checks across domains. Application owns
workflow ordering; DB implements atomicity and authorized list queries. HTTP, SQL, React and provider lifecycle
remain outside Application. See [domain services](./domain-services.md).

The cloud application coordinates current personal/project authorization,
idempotent commands, owner-fenced execution, model reservations and atomic
revision publication. API and Worker both use this same execution model.
Queued Runs commit with their Turn/Round and admission facts and are directly
claimable, without an outbox event or acceptance command.

## `@raypx/client`

The transport adapter. `createApiClient({ baseUrl?, headers, fetch })` returns a
typed client generated from the shared contract. Web and Desktop provide
an absolute API origin and send credentialed requests.

Framework-independent conversation/run sessions own replay, deduplication,
contiguous cursors and reconnects. Apps own session lifetimes by account and
resource; React reads the external store with `useSyncExternalStore`.

## `@raypx/storage`

Server-only implementation of Core's object-storage port, shared by API and
Worker. It supplies private S3 transfers, signed bounded uploads, authorized
downloads and memory/filesystem test adapters. DB keeps metadata, never object
bytes or provider credentials. Frontend applications cannot import this package.

## `@raypx/agent-ui`

Controlled business views for composing messages, research sources, execution
progress, tools and artifact review. Apps inject snapshots, actions and platform
capabilities. Local state covers focus, selection, expansion and following the
latest message; the package owns no transport or second copy of server facts.

## API server modules (`apps/api/server/api`)

The internal transport and composition modules of the standalone API app. They
own Hono routes, oRPC handlers, Better Auth session resolution, resource authorization, CORS, mail composition, dynamic authentication-policy enforcement,
and the pooled database runtime. They export process-scoped `ApiModules`,
request-scoped Auth context types, factories, and an environment preset, but do
not own the Nitro listener or process lifecycle.
The retired AI adapter has no replacement. Private model and research operations
return unavailable; bootstrap exposes no model. Existing execution grants,
authorization, object transfer validation and Cloud records remain active under
[ADR-0027](./decisions/0027-remove-pi-sdk.md).
Hono resolves one application session per RPC request; oRPC principal middleware
injects a non-null principal into protected handlers. Better Auth database IDs are
generated as UUID v7 values so
new records retain time-ordered locality while remaining globally unique.

## `@raypx/cache`

The optional server-side Redis adapter provides JSON `remember` with TTLs and
raw-string Better Auth secondary storage. Atomic token consumption and rate
increments stay in Redis Lua scripts. API uses its atomic counter for cloud AI
admission; Better Auth sessions, verification and policy use PostgreSQL directly.
The adapter has no fallback store and no unused generic add/pull/flush facade.
Mail configuration remains database-backed.

## `@raypx/shared`

The foundation shared by domain and adapter packages. It owns
the framework-independent `DomainError` envelope, inherited setting
value types, and injectable clock/ID interfaces with their default
implementations. Core re-exports these primitives for compatibility, while DB
consumes them directly so the dependency seam remains explicit.

The package also owns two framework-oriented subpath families while keeping
those dependencies isolated from the root and from each other:

- `@raypx/shared/env` and `@raypx/shared/env/runtime` compose and validate
  caller-supplied environment values. Applications still own their variables;
  this package never reads `.env` files. Blank strings normalize to `undefined`,
  defaults apply before validation, and browser access rejects server values.
- `@raypx/shared/logger` and its `client`, `env`, `hono`, `orpc`, and `vite`
  subpaths configure Evlog, provide the central redaction policy, and expose
  optional surface adapters. Operational logs remain separate from durable
  audit records.

Public subpaths resolve to ESM and declaration files built in `dist/`. Zod and
Evlog are runtime dependencies; Hono, oRPC, and Vite are optional adapter peers.
The source remains the target for tests and type checks. Installation builds the
initial output, while the root development and verification commands refresh it.

## `@raypx/core`

Framework-independent business rules and repository interfaces. Its single
public barrel is organized into bounded contexts:

- `settings` owns typed mail/Auth policy, source and inheritance rules, and
  public Auth capability derivation.
- `projects` owns the account-first V2 Project scope, ProjectMember roles,
  lifecycle, and centralized capability evaluator. V2 resources are modeled
  independently of Workspace and Project Studio.
- Project Task models live within `projects`; `assets`, `reviews` and `activity`
  own their records and repository ports. `cloud` owns Conversations, TaskRounds,
  Runs, execution grants, usage and delivery revisions.
- `assets` retains the blob upload/download port and errors used by V2.
- Cloud cancellation and execution invariants live in the cloud domain. Outbox
  ports, task notifications, legacy device execution and Project AgentRun
  ports/adapters are retired.

These contexts remain one package until a second independent server consumer
creates a stable extraction seam. UI features under `apps/*/src/features` are
composition and presentation modules, not domain modules.

It does not import React, Hono, Nitro, or Drizzle.

## `@raypx/auth`

The session vocabulary and compatible stored roles (`user`, `admin`, `owner`).
Admin permission grants and `hasPermission` are retired. Global roles do not
grant access to another account's Cloud content. Authentication policy still
controls registration and mail through API runtime guards.

`apps/api/server/api` owns the Better Auth adapter and production cookie
session resolver. The development header resolver remains available for
injected tests and local preview only; the oRPC router and core services do
not depend on the provider.

## `@raypx/mail`

Typed API-owned mail delivery for verification, password reset and welcome.
Task-notification templates and send methods are retired; Worker has no Mail
dependency.
Verification and reset share a link template; typed senders share current
configuration resolution and delivery. The unused Admin test-mail method is removed.
Its JSON catalogs are rendered through the server-only `@raypx/i18n`
translator using `MAIL_DEFAULT_LOCALE`, which falls back to English.
React Email templates always provide HTML and plain-text output. Resend is the
production transport; development and test use a logger transport without
network access. Production throws `MailUnavailableError` at delivery time when
configuration is unavailable, rather than failing process startup or silently
using the logger transport. The package exposes only server-side mail interfaces.

## `@raypx/i18n`

The private product configuration and compatibility facade for `@raypx/intl`.
It configures `en`/`zh`, language names, fallback and Cookie/storage settings,
retains the old brand preference migration and translates the `data.error`
envelope. Generic runtime implementation lives in the independently released
library. Applications and Mail own their catalogs; domain and contracts stay
independent. See [internationalization ownership](./intl.md).

## External Toolkit libraries

`@raypx/intl` supplies configurable locale negotiation, ICU translation, Intl
formatting, React providers and isolated catalog testing. Raypx consumes it
through its private i18n facade; see [ADR-0030](./decisions/0030-independent-intl-library.md).

`@raypx/drizzle` is owned by the independent
[Raypx Packages](https://github.com/raypx/packages) repository, not a workspace in
this product repository. It supplies public-API SQL expressions, JSONB helpers,
result unwrapping, PostgreSQL error recognition and plan summaries. Product DB
adapters retain schema, migration and permission ownership. See
[Drizzle extensions](./drizzle-extensions.md) and
[ADR-0029](./decisions/0029-toolkit-drizzle-extraction.md).

## `@raypx/db`

The database adapter package.

- Drizzle PostgreSQL schema lives in domain modules under `src/schema/`,
  exposed by the small `src/schema.ts` entrypoint.
- Settings readers, V2 and cloud adapters live in separate domain directories.
  Historical migrations remain reference material; retired local execution table
  definitions and adapters are removed while the active cloud baseline stays unchanged.
- V2 Project, organization membership, Task, Asset, Review, Feedback, Activity,
  and cloud execution adapters implement Core ports. Turn/Task/Run creation and
  admission facts use one PostgreSQL transaction. Queued Runs are listed and
  atomically claimed directly.
- Blob storage remains available in memory and on the filesystem.
- `system_settings` stores typed ordinary configuration keys and
  `system_secrets` stores write-only secret values. Both record the updater and
  timestamp.
- Authentication policy reuses `system_settings`: registration mode, an exact
  email-domain allowlist encoded as JSON text, and the welcome, verification,
  and password-reset email switches. Only typed repository methods can access
  these fixed keys.
- Resolution is field-scoped. Database values override mail environment/default
  fallbacks; Auth values override built-in defaults. Runtime repositories are
  read-only. Repository views include
  sources and safe inherited previews, while runtime resolvers omit that
  presentation metadata and retain server-only secret material.
- Historical user/audit/configuration compatibility tables remain in the active
  baseline. Retiring Admin does not drop stored data or rewrite migrations.
- Outbox, notification and preference tables, plus the dispatch-ready column,
  remain schema-local compatibility data. Active runtime ports and writes are
  retired without migration or notification replay; see
  [ADR-0026](./decisions/0026-direct-run-queue-and-retire-task-notifications.md).
- Active tables are exposed by `schema.ts`; `schema/migrations.ts` adds the
  retained compatibility definitions for generation into `drizzle-cloud/`.
  Historical `drizzle/` migrations remain reference material. See
  [database architecture](./database.md) for the separate runtime and physical graphs.
- Database tables and Drizzle details are not exposed to frontend apps.

`repositories/settings/values.ts` shares pure decoding and configuration resolution
across the memory and PostgreSQL adapters. Both expose the same two read methods
without an inherited reader. Unused writers and audit construction are retired. Authentication reads
policy at each decision, optionally through the short-lived Redis cache. Mail
resolves current configuration on each delivery; no process-lifetime cache exists.

## `@raypx/ui`

Shared visual primitives and design-system utilities:

- Base UI interactive primitives.
- shadcn `base-nova` component conventions.
- Phosphor Icons for renderer surfaces.
- Tailwind CSS v4 variables and theme tokens.
- SSR-safe `ThemeProvider`, `ThemeScript`, and `useTheme` for light, dark, and
  system themes.
- Base-nova `Button`, `Badge`, `Avatar`, `DropdownMenu`, and
  form components, plus the product-specific `Logo`.
- A lazy Toast manager bridge exposed through `@raypx/ui/toast`; it loads the
  concrete Toast implementation only when the first notification is added.
- `cn`, CVA and `styledSlot` helpers for composition. Unconsumed Card, Checkbox,
  Table, Separator and Toggle trees are removed together with exclusive exports
  and regeneration entries.
- Shared base-nova semantic colors, focus, radius, and motion tokens from
  `packages/ui/src/styles/globals.css`.

Each renderer has a `components.json` that targets the shared UI package with
`style: "base-nova"`, `rsc: false`, and `iconLibrary: "phosphor"`. Page layout,
route trees, and product-specific visual composition remain in their owning
application so migration can happen incrementally.

Import generated UI primitives through their explicit
`@raypx/ui/components/ui/<component>` subpath. The package root intentionally
does not re-export components so bundlers can tree-shake each primitive
independently. Product wrappers such as `Avatar` and `Logo` retain their own
top-level subpaths. Renderer applications that need deferred notifications use
`@raypx/ui/toast`; the concrete Toast implementation remains available at
`@raypx/ui/components/ui/toast` for direct UI-package tests and composition.

## `@raypx/scripts`

A private Bun CLI for procedural repository automation. Turbo owns the task
graph; Scripts owns operations that understand the repository or database.
Runtime applications must never import this package.

The existing `rpx` bin also exposes `rpx env -- <command>`. This
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

## `@raypx/tsconfig`

Shared strict TypeScript presets. They define compiler behavior but never own
consumer `include`, `exclude`, `paths`, output directories, or project
references. See [Toolchain](./tooling.md) for the preset matrix.
