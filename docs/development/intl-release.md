# Voidmix library changes

Raypx consumes `@voidmix/*` from npm at exact versions. Voidmix is maintained in
its own repository, so a change that needs a new Voidmix API follows the same
three steps.

## 1. Develop against a local link

Link the Voidmix package being changed. This replaces only `node_modules`; the
manifest and lockfile stay untouched.

```sh
cd ../voidmix/packages/intl
bun run build        # or keep `bun run dev` running
bun link
cd ../../../raypx
bun link @voidmix/intl
```

The link points at the Voidmix checkout, which has its own React. Every Vite and
Vitest config dedupes `react` and `react-dom` so that links never create a
second React. Metro does not follow links
outside the repository; verify mobile against a snapshot instead. Run
`bun install` to return to the registry version.

## 2. Pin a snapshot on the branch

From a clean Voidmix branch, `bun run release:snapshot` packs and verifies
`0.0.0-next-<timestamp>-<commit>` previews. Publishing them with `--publish`
(under the `next` dist-tag) is a maintainer action. Set the root catalog entry to
the exact printed version and run `bun install`, so the Raypx branch installs and
passes CI on its own.

## 3. Replace the snapshot before merging

After Voidmix releases its alpha, set the catalog to that exact version, run
`bun install` and `bun run verify`. Never merge with a snapshot version, a range,
a `link:` or a tarball path.

Breaking Voidmix changes are acceptable during this stage; Raypx adopts them in
the same branch rather than through compatibility layers.

`@voidmix/intl` bundles `use-intl`, so Raypx never declares or imports it
directly. A separate `use-intl` or `next-intl` install would create a second,
unconnected IntlProvider context.
