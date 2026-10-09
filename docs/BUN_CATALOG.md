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

```bash
# Update in root package.json catalog
{
  "catalog": {
    "evlog": "2.31.0"  // <- Change here
  }
}

# Then reinstall
bun install

# All packages using "evlog": "catalog:" will get 2.31.0
```

## Migration

We've migrated key dependencies to catalog:

- ✅ evlog
- ✅ better-sqlite3
- ✅ drizzle-orm
- ✅ better-auth

Other dependencies remain package-specific as they should be.

---

**Centralized version management for consistency** 📦
