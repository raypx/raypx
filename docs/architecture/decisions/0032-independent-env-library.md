# ADR-0032: Independent environment library

## Status

Accepted. Supersedes environment implementation ownership in ADR-0012 while
retaining its Shared compatibility subpaths, primitive ownership and logging
boundary. Repository name, npm scope, pinned version and the Shared
compatibility subpaths are superseded by [ADR-0033](./0033-voidmix-library-scope.md).

## Context

Shared combines reusable environment composition and validation with product
foundation primitives and operational logging. The environment implementation
has no dependency on product schemas, repository ports or application variables.
The user requested moving it into the independently released Raypx Packages
repository alongside Drizzle and Intl.

The npm name `@raypx/env` already has a release history. The new library continues
that history at `0.0.6` rather than attempting another `0.0.0` publication.
Existing product consumers depend on Shared's built environment subpaths and
must retain their runtime behavior and import paths.

## Decision

Maintain `@raypx/env` in
[Raypx Packages](https://github.com/raypx/packages/tree/main/packages/env), with
independent versions, changelog, Changesets releases and explicit ESM exports.
The root owns `createEnv`, `defineEnv`, `EnvError`, Zod exports and public types;
`./runtime` owns the base `NODE_ENV` preset. Zod is an external peer, avoiding a
second schema runtime when applications compose their own presets.

The library owns typed nested preset composition, overrides, default handling,
blank-value normalization, validation, runtime environment detection and guarded
browser access. `createEnv` uses the existing `VITE_` public prefix; `defineEnv`
supports an explicit prefix. Applications can supply runtime values and error
handlers. The runtime preset retains `development`, `production` and `test`.

Keep `@raypx/shared/env` and `@raypx/shared/env/runtime` as direct compatibility
exports. Remove their copied runtime implementation and private type module.
Application, adapter and Logger presets remain in their owning workspaces, with
existing imports and validation behavior. Shared builds keep the environment
library external so functions, schemas and the error class retain one identity.

Preserve `import.meta.env` expressions in the published library for the consuming
Vite application build. Web and Desktop retain automatic public-value and mode
resolution; server processes retain process environment resolution. Verify real
packaged imports on Bun and Node and browser defaults in a Vite-built fixture,
including execution without a process global and rejection of server fields.

Consume npm `0.0.6` through the default root Bun catalog, recording registry
integrity in `bun.lock`. Policy treats this scoped dependency as an external
Toolkit package. Do not introduce a product workspace or local archive bridge.

Environment validation never loads `.env` files. The private Dotenvx repository
runner remains in Scripts, including its child environment, signal forwarding
and nested-call behavior. This extraction does not add a CLI or move Logger,
Cache or TypeScript presets.

## Consequences

Other applications can adopt validation and preset composition without depending
on Raypx's foundation or environment variables. Raypx keeps its existing Shared
imports while maintaining the reusable implementation once.

Generic validation and type regressions belong to the public library. Product
tests retain facade identity, preset inference, Logger composition and browser
access checks. Shared and Scripts run their narrow checks before the complete
product verification gate. No schema or migration change is involved.

Releases require a compatible external Env version and Zod peer. Product updates
change the root catalog and lockfile after a registry release is available;
package publication remains an independently authorized operation.

## Follow-up

Revisit additional integrations when there is a concrete consumer. Keep product
presets and repository environment loading outside the public validation API.
