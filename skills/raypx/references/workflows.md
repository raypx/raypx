# Workflows

## Add a workspace

`bun run workspace:new <name> --kind library --target universal --tests` previews;
add `--write` to create it. Keep its `AGENTS.md` short, declare direct dependencies
(`catalog:` for runtime libraries, `catalog:dev` for tools, `workspace:*` internally)
and add a package only when its responsibility and consumers exist.
See [extending workspaces](../../../docs/development/workspaces.md).

## Add a Web or Desktop route

Create a file under `apps/<app>/src/routes`; the Start plugin regenerates
`routeTree.gen.ts` (never edit it). Signed-in Web pages go under `routes/(app)`,
sign-in pages under `routes/(auth)`. Keep heavy client modules out of
`__root.tsx` and shared layouts; import them from the route that needs them.

## Add an RPC procedure

1. Define input/output with Zod in `packages/contracts/src/api.ts` (`apiContract`).
2. Implement it in `apps/api/server/api.ts` through `os.<group>.<name>.handler`.
3. Call it through `@raypx/client`; read it in UI with TanStack Query.
4. Translate failures to safe error codes; never show server diagnostic messages.
   Local device messages belong in `contracts/local` and never on public RPC.

## Copy and translations

Add keys to both `packages/i18n/src/messages/en.ts` and `zh.ts`, then run
`bun run i18n:check`. Keep Chinese/English copy, accessible labels, keyboard focus
and reduced-motion behavior. See [internationalization](../../../docs/architecture/internationalization.md).

## UI primitives

Run `bunx shadcn@latest add <component>` inside `apps/web` (its `components.json`
aliases `ui` to `@raypx/ui/components/ui`), adapt the file to `#lib/utils` and record
it in `packages/ui/shadcn-components.json`.

## Analytics events

Events are allowlisted in `packages/analytics/src/index.ts` (`eventPolicy`); only enum
properties survive. Never add task IDs, prompts, paths, URLs or profile attributes.
Release builds can upload hidden source maps with `bun run analytics:sourcemaps`.
See [analytics](../../../docs/architecture/analytics.md).

## Raypx Kit libraries

`@raypx-kit/*` lives in the separate `raypx-kit` repository and is pinned to exact
published versions. Preview unreleased changes with `bun link` or a vendor archive,
then pin the published alpha before merging. See [library workflow](../../../docs/development/intl-release.md).
