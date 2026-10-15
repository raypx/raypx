# Raypx delivery goal

> Status: product target with live execution unavailable, October 13, 2026. The former local-first
> workbench goal is replaced by [the cloud platform](./cloud-platform.md),
> [ADR-0019](./decisions/0019-retire-legacy-desktop-execution.md) and
> [ADR-0020](./decisions/0020-electrobun-desktop-host.md).

## Product outcome

Raypx helps people research sources, analyze files and create reviewable
reports, spreadsheets and presentations. Web owns the primary flow:

```text
Sign in → Search or Computer prompt → authorized tools and sources
→ streamed cloud execution → private delivery revision → user acceptance
```

Search returns attributed answers. Computer produces verified files using
trusted tools. Personal work does not require a Project. TaskRounds preserve
revision goals and budgets; accepting the current delivery completes its Task.
Missing providers and failed or cancelled work have explicit states.
The AI adapter is removed under
[ADR-0027](./decisions/0027-remove-pi-sdk.md). Live model and public research
execution are unavailable; saved Cloud work, files and reviews remain accessible.

## Desktop

Desktop is an Electrobun project and task management client. It lists and creates
projects, reads project details, and lists/creates project tasks through the
canonical API. Navigation contains Projects and Settings; `/` opens Projects.
It retains account isolation, theme, English/Chinese, keyboard navigation,
800px minimum width, native window controls and the show/hide/quit tray menu.

The TypeScript native host uses Electrobun's pinned Bun runtime. Vite+ and
TanStack Start own the renderer. Local Pi execution, folders, device routing,
offline sync, unavailable preference controls and Activity are retired.
Cloud history and delivery review remain Web capabilities. Live Search/Computer
requires a future accepted execution adapter.

## Operational foundations

Preserve API authorization, project spending grants, owner-fenced execution,
usage reservations and ledger, and private storage. Worker owns durable Run claims,
isolated Runner lifecycle and independently verified file generators; private
execution grants authorize Gateway calls. Task notifications and outbox dispatch
remain retired. Operational logs remain separate from durable domain facts.

Admin pages, operational queries and management writers are retired under
[ADR-0021](./decisions/0021-retire-admin.md). Existing account status guards and
resource authorization remain; database history and stored data are preserved.

## Visual and delivery acceptance

Use the shared shadcn Neutral system, original colored brand assets, accessible
control names, keyboard focus, readable long content and reduced motion. Verify
responsive Web views and the native Desktop size boundary.

Run owning narrow checks, then `bun run verify`. Database and browser suites use
an explicit PostgreSQL 17 test database. Native packaging/launch checks are
separate from browser-preview checks; macOS and Windows use their native CI
runners. Restoring provider execution requires the design and acceptance gate described in
[cloud release acceptance](../development/cloud-acceptance.md).
