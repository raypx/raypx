# Scripts

This directory contains utility scripts for the project.

## Available Scripts

### clean.ts
Clean all build artifacts and turbo cache.

**Usage:**
```bash
pnpm run clean:all
```

**What it does:**
- Runs `turbo run clean` to clean all packages
- Removes `.turbo` directory
