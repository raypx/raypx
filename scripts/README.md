# Scripts

This directory contains utility scripts for the project.

## Available Scripts

### clean.ts
Clean all build artifacts, cache, and node_modules.

**Usage:**
```bash
pnpm tsx scripts/clean.ts
```

**What it does:**
- Runs `turbo run clean` to clean all packages
- Removes `.turbo` directory
- Removes `node_modules` from all apps and packages

---

### migrate.ts
Run database migrations and generate client.

**Usage:**
```bash
pnpm tsx scripts/migrate.ts
```

**What it does:**
- Generates database client from schema
- Pushes schema changes to database

---

### build-all.ts
Build all applications in the correct order.

**Usage:**
```bash
pnpm tsx scripts/build-all.ts
```

**What it does:**
- Builds API
- Builds Web
- Builds Docs
- Builds Desktop

---

### check-deps.ts
Check for outdated dependencies across all packages.

**Usage:**
```bash
pnpm tsx scripts/check-deps.ts
```

**What it does:**
- Runs `pnpm outdated --recursive`
- Shows all packages that have newer versions available

---

## Quick Reference

| Command | Description |
|---------|-------------|
| `pnpm clean:all` | Clean all build artifacts |
| `pnpm tsx scripts/migrate.ts` | Run database migrations |
| `pnpm tsx scripts/build-all.ts` | Build all applications |
| `pnpm tsx scripts/check-deps.ts` | Check for outdated dependencies |
