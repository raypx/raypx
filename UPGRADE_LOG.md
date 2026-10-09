# Dependency Upgrade Log

## Upgrade Method

Used **taze** to upgrade all dependencies to latest versions.

```bash
bunx taze major -r -w
```

Options:

- `major` - Include major version updates
- `-r` - Recursive (all workspace packages)
- `-w` - Write changes to package.json files

## Taze Benefits

- ✅ **Smart Updates** - Respects workspace protocol
- ✅ **Interactive** - Shows what will change
- ✅ **Safe** - Checks compatibility
- ✅ **Recursive** - Updates all workspace packages
- ✅ **Catalog Support** - Updates Bun catalog entries

## Post-Upgrade

After running taze:

```bash
bun install        # Install new versions
bun run build      # Test builds
bun run typecheck  # Verify types
bun run test       # Run tests
```

## Version Changes

See individual package.json files for specific changes.

---

**All dependencies upgraded to latest versions** 📦⬆️
