# Raypx Kit library changes

Merged Raypx changes consume `@raypx-kit/*` from npm at exact versions. Raypx Kit is
maintained in its own repository, so a change that needs a new Raypx Kit API follows
the same three steps. Review branches may use a published snapshot or a tracked
local archive while publication is pending; neither is a merge-ready dependency.

## 1. Develop against a local link

Link the Raypx Kit package being changed. This replaces only `node_modules`; the
manifest and lockfile stay untouched.

```sh
cd ../raypx-kit/packages/intl
bun run build        # or keep `bun run dev` running
bun link
cd ../../../raypx
bun link @raypx-kit/intl
```

The link points at the Raypx Kit checkout, which has its own React. Every Vite and
Vitest config dedupes `react` and `react-dom` so that links never create a
second React. Run
`bun install` to return to the registry version.

## 2. Pin a snapshot on the branch

From a clean Raypx Kit branch, `bun run release:snapshot` packs and verifies
`0.0.0-next-<timestamp>-<commit>` previews. Publishing them with `--publish`
(under the `next` dist-tag) is a maintainer action. Once the snapshot is published,
set the root catalog entry to that exact version and run `bun install`, so the
Raypx branch installs and passes CI on its own. Packing alone does not make the
printed version resolvable from npm.

### Branch preview without npm publication

For a new, unpublished package, track its verified compiled archive
inside Raypx rather than depending on another checkout or a temporary directory:

1. Verify the Raypx Kit source and record its provenance. For a clean source commit,
   record `sourceCommit` and run `bun run release:snapshot logger` without
   `--publish`, or pack the verified package with `bun pm pack --ignore-scripts`.
   For an uncommitted implementation, use the direct pack command and record
   `sourceBaseCommit`, an explicit uncommitted `sourceWorkingTree` marker and a
   SHA256 checksum for every package source, test, configuration and documentation
   file. Never represent working-tree changes as an archive of the base commit.
   Keep the version inside the verified archive unchanged; do not claim that an
   unpublished alpha exists in the registry.
2. Copy the archive into `vendor/` with a filename containing the package version
   and archive content hash. Record the provenance above, repository URL, archive
   name, full SHA256 checksum, packing command, tool versions and pending
   publication status in `vendor/<package>.json`. Keep a short update procedure in
   `vendor/README.md`.
3. Point the root runtime catalog at `file:vendor/<archive>.tgz`. Each consuming
   workspace still declares the package through `catalog:`. Commit the
   archive, metadata, catalog change and regenerated `bun.lock` together. Use a
   new filename whenever archive contents change, even if the manifest version
   is unchanged, to avoid stale package-manager caches.
4. In an isolated Raypx checkout without a sibling Raypx Kit checkout, run
   `bun install --frozen-lockfile`, the affected workspace tests and
   `bun run verify`. Inspect the lockfile for repository-relative archive paths
   and integrity hashes; it must not refer to temporary or absolute paths.

These tracked archives make a review branch reproducible. They are not editable
source forks, publication claims or an exception to the merge gate below. Keep
reusable implementation in Raypx Kit. A `bun link` installation alone is not a
reproducible branch dependency.

## 3. Replace the snapshot before merging

After Raypx Kit releases its alpha, set the catalog to that exact version, run
`bun install` and `bun run verify`, and remove the corresponding preview archive
and metadata in the same change. Confirm the alpha resolves from the registry.
Never merge with a snapshot version, a range, a `link:` or a tarball path.

Breaking Raypx Kit changes are acceptable during this stage; Raypx adopts them in
the same branch rather than through compatibility layers.

`@raypx-kit/intl` bundles `use-intl`, so Raypx never declares or imports it
directly. A separate `use-intl` or `next-intl` install would create a second,
unconnected IntlProvider context.

Logging currently lives in Raypx's private `@raypx/logger` source workspace. API
and CLI use `workspace:*` and keep evlog in the external runtime catalog. Logger
needs no Kit release or preview archive while its product workflow settles.
Future extraction follows the release steps above. Its safe/managed/stream
behavior is checked by workspace tests and Raypx's Node, Worker and standalone
CLI artifact gates; packaged-platform acceptance remains separate.
