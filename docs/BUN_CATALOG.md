# Bun Catalog Usage

## What is Bun Catalog?

Bun's workspace catalog feature allows you to centralize dependency versions across your monorepo. Instead of specifying versions in each package, you define them once in the root `package.json`.

## Benefits

✅ **Version Consistency** - All packages use the same version
✅ **Easy Updates** - Update once in catalog, applies everywhere
✅ **Reduced Lock File Size** - Fewer duplicate entries
✅ **Clear Dependencies** - See all shared versions in one place

## Configuration

### Root package.json

```json
{
  "workspaces": {
    "packages": ["apps/*", "packages/*"],
    "catalog": {
      "vite": "npm:@voidzero-dev/vite-plus-core@1.1.0",
      "vite-plus": "1.1.0",
      "evlog": "2.30.1",
      "better-sqlite3": "11.8.1",
      "drizzle-orm": "0.36.4",
      "better-auth": "1.6.1"
    }
  }
}
```

### Package usage

```json
{
  "dependencies": {
    "evlog": "catalog:",
    "drizzle-orm": "catalog:"
  }
}
```

## When to Use Catalog

### ✅ Use for:

- Shared infrastructure dependencies (evlog, drizzle-orm)
- Build tools (vite, vite-plus)
- Framework versions that must match across packages

### ❌ Don't use for:

- Package-specific dependencies
- Versions that legitimately differ between packages
- Experimental/unstable packages

## Current Catalog

- `evlog@2.30.1` - Logging (used by logger, auth, db)
- `better-sqlite3@11.8.1` - SQLite driver (used by db)
- `drizzle-orm@0.36.4` - ORM (used by db, auth)
- `better-auth@1.6.1` - Authentication (used by auth)
- `vite@1.1.0` - Build tool (all packages)
- `vite-plus@1.1.0` - Task runner (all packages)

## Updating Versions

Use `bun run deps:outdated` to inspect workspace updates. Edit selected versions
in root `workspaces.catalog`, then run `bun install` to update `bun.lock`; keep
workspace `catalog:` references intact. Review both files. Use
`bun run deps:update '<package>@<version>'` for non-catalog declarations.
The catalog also centralizes Vitest, its coverage/browser plugins, and Playwright;
workspaces consume them through `catalog:`.

Vite+ upgrades additionally need the Vite alias override and matching bundled
Vitest plugins. Run `bun run deps:check` after installation and follow the full
[dependency maintenance workflow](VERSION_STRATEGY.md).
