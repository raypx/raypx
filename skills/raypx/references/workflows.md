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

## Raypx Kit libraries

`@raypx-kit/*` lives in the separate `raypx-kit` repository and is pinned to exact
published versions. Preview unreleased changes with `bun link` or a vendor archive,
then pin the published alpha before merging. See [library workflow](../../../docs/development/intl-release.md).

## Capability recipes

- New RPC procedure: [api](api.md)
- Translations: [internationalization](internationalization.md)
- UI primitives and theme: [design system](design-system.md)
- Analytics events: [analytics](analytics.md)
- Schema changes and migrations: [database](database.md)
