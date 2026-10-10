# Raypx AI-Assisted Development Guide

## Git Commit Guidelines

**Do NOT add Co-Authored-By or attribution lines to commits.**
All commits should be authored by the repository owner directly.

## Project Status

Raypx is a full-stack foundation using Bun workspaces, Vite+, React, and
TanStack Start. It provides runtime validation, safe HTTP boundaries, logging,
metrics, provider lifecycle, explicit SQLite migrations and authentication,
validated cache helpers, reusable query hooks, and shadcn components.
Applications activate providers and add their own business rules.

Use Bun 1.4.2 from `.bun-version` and stable Node.js `>=22.22.1 <23.0.0`
(`devEngines.runtime.version: ^22.22.1`). `.node-version` recommends Node.js
22.22.1 and fixes the CI version; later stable Node.js 22 releases are supported.
The broader root `engines.node` range declares tool compatibility, while
development requires Node.js 22. Bun installs dependencies and runs production;
Node-compatible Vite+, Vitest, Oxlint, and tsc entrypoints remain part of the
toolchain. Bun executing TypeScript does not replace strict type checking.
Authors use `Zack <heyloyep@gmail.com>`.

## Code Placement

- `apps/web`: Start routing, SSR, framework adapters, initialization, and deployment.
- `apps/web/src/features/<feature>/hooks`: Product-specific query, mutation, and workflow hooks; colocate feature contracts and clients in the same feature.
- `packages/contracts`: Browser-safe Zod contracts and inferred types.
- `packages/client`: React-free validated HTTP core, errors, timeout, and cancellation.
- `packages/client/src/react`: Reusable browser-safe data hooks, auth mutations, and explicit React/TanStack Query adapters, exported as `@raypx/client/react`.
- `packages/ui`: Components, styles, and component behavior hooks at `@raypx/ui/hooks`; no business workspace dependencies.
- `packages/api`: Request context, safe errors, metrics, guards, probes, and lifecycle.
- `packages/db`, `auth`, `storage`, `logger`, `worker`: Server capabilities with explicit activation and resource ownership.
- `packages/env`: Separate client/server exports; no mixed root entrypoint.
- `packages/config`: Engineering tools and static `@raypx/config/tsconfig/*.json` presets. The `tsconfig-presets` path is a compatibility export.

The former `@raypx/api-client` and `@raypx/hooks` packages are removed without
aliases. Migrate HTTP imports to `@raypx/client`, business hooks to
`@raypx/client/react`, and component behavior to `@raypx/ui/hooks`.
See [ARCHITECTURE.md](ARCHITECTURE.md) and [EXAMPLES.md](EXAMPLES.md).

## Development Workflow

### Adding New Features

1. **Evaluate feature placement**
   - Product-specific features → `apps/web/src/features/<feature>/`
   - Reusable data capabilities → Implement in feature first, promote to `packages/` after demonstrated reuse
   - UI components → `packages/ui/src/`
   - Server capabilities → Appropriate server package (`api`, `db`, `auth`, etc.)

2. **Create feature directory structure** (for new features in web)

   ```
   apps/web/src/features/user-profile/
   ├── components/    # React components
   ├── hooks/         # Data hooks
   ├── contracts/     # Zod schemas (if needed)
   └── routes/        # Start routes
   ```

3. **Write tests first**
   - Add unit tests in `test/unit/`
   - Use `vp test run --project unit` for fast iteration

4. **Implement feature**
   - Follow TypeScript strict mode
   - Use public package exports only
   - Avoid `any` types

5. **Verify**
   ```bash
   vp test run --project unit    # Unit tests
   vp check                      # Format, lint, types
   vp run dev                    # Local verification
   ```

### Fixing Bugs

1. **Reproduce the issue** locally
2. **Write a failing test** that demonstrates the bug
3. **Implement minimal fix** without over-refactoring
4. **Verify fix**
   ```bash
   vp test run --project unit
   vp test run                   # Full test suite
   vp check
   ```
5. **Check related code** - Does the same bug exist elsewhere?

### Promoting Code to Shared Packages

**When to promote:**

- ✅ Used in multiple features
- ✅ Has stable, validated API
- ✅ Has complete tests
- ✅ Has clear documentation

**When NOT to promote:**

- ❌ Only used in one product
- ❌ API still changing rapidly
- ❌ Contains product-specific logic

**Promotion steps:**

1. Confirm code is stable and reused
2. Move to appropriate `packages/` directory
3. Add public export to package's `index.ts`
4. Add or update tests
5. Update import paths in calling code
6. Run `vp check` to verify boundaries

## Testing Strategy

### When to Run Which Tests

**During development (fast feedback):**

```bash
vp test run --project unit          # Only unit tests (< 30s)
vp test run --project unit -t "specific test"
vp test --project unit              # Watch mode
```

**Before commit (full verification):**

```bash
vp test run                         # All tests
vp check                            # All checks
```

### Test Types

**Unit Tests (test/unit/)**

- Pure function logic
- Data transformations
- Validation logic
- Mock external dependencies (HTTP, DB, filesystem)
- Should be very fast (< 5s per file)

**Integration Tests (test/integration/)**

- Start real servers
- Test HTTP endpoints
- Test database interactions
- Test filesystem operations
- Allow longer timeout (< 30s per file)

**UI Tests (\*.test.tsx)**

- React component rendering
- User interactions
- State management
- Use jsdom environment

### Writing Good Tests

**DO:**

- ✅ Use descriptive test names
- ✅ Follow arrange-act-assert pattern
- ✅ Mock external dependencies
- ✅ Clean up resources (afterEach, afterAll)
- ✅ Test behavior, not implementation

**DON'T:**

- ❌ Test third-party libraries
- ❌ Use random data (use fixed fixtures)
- ❌ Access network or database in unit tests
- ❌ Add placeholder tests without assertions

## Architecture Principles

### Package Boundaries

**Dependency direction:**

```
apps/web
  ↓
packages/client, packages/ui
  ↓
packages/contracts
```

**Forbidden dependencies:**

- ❌ Packages cannot depend on apps
- ❌ No circular dependencies
- ❌ Client and UI cannot import server packages
- ❌ Cannot import other package's `src/` or `dist/`

**Verification:**

```bash
vp run check:boundaries  # TypeScript AST check
vp lint                  # Oxlint custom rules also check
```

### Client/Server Separation

**Server-only packages:**

- `@raypx/db`, `@raypx/auth`, `@raypx/storage`, `@raypx/logger`, `@raypx/worker`, `@raypx/api`
- `@raypx/env/server`

**Browser-safe packages:**

- `@raypx/client`, `@raypx/ui`, `@raypx/contracts`
- `@raypx/env/client`

**Usage in apps/web:**

- Server packages only in `.server.ts` files
- Start's import protection enforces this

### Common Pitfalls

**Pitfall 1: Module scope side effects in SSR**

```typescript
// ❌ Wrong: accesses localStorage at module load time
const theme = localStorage.getItem("theme");

// ✅ Right: access in component
function App() {
  const theme = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
}
```

**Pitfall 2: Shared module-level state**

```typescript
// ❌ Wrong: module-level QueryClient shared across SSR requests
import { QueryClient } from "@tanstack/react-query";
const queryClient = new QueryClient();

// ✅ Right: create new QueryClient per request
// (web/src/routes/__root.tsx already handles this correctly)
```

**Pitfall 3: Node built-ins in browser code**

```typescript
// ❌ Wrong: importing Node built-ins in browser code
import fs from "node:fs";

// ✅ Right: only use in .server.ts files
// apps/web/src/routes/api.server.ts
import fs from "node:fs";
```

### Performance Principles

**Minimize client bundle:**

- Avoid importing large libraries in client components
- Use dynamic imports for heavy components
- Check bundle size: `vp run build`

**Server-side lazy loading:**

```typescript
// ✅ Good: lazy import heavy features
export async function action() {
  if (needsImageProcessing) {
    const { processImage } = await import("./image-processor");
    await processImage();
  }
}
```

**Avoid module scope heavy work:**

```typescript
// ❌ Wrong: runs on every import
const data = expensiveComputation();

// ✅ Right: lazy evaluation
let _data: Data | undefined;
export function getData() {
  if (!_data) _data = expensiveComputation();
  return _data;
}
```

## Git Workflow

### Branch Strategy

**Main branch:** `main`

- Protected, cannot push directly
- All PRs must pass CI
- Use squash merge

**Feature branch naming:**

```bash
feat/<feature-name>      # New features
fix/<bug-description>    # Bug fixes
refactor/<scope>         # Refactoring
docs/<topic>             # Documentation
chore/<task>             # Engineering tasks
```

### Commit Message Format

Use Conventional Commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code change without behavior change
- `docs`: Documentation
- `test`: Tests
- `chore`: Engineering tasks
- `perf`: Performance optimization

**Scopes:**

- Package names: `client`, `ui`, `api`, `db`, `auth`, `storage`, `logger`, `worker`, `env`, `config`
- App names: `web`
- Feature modules: `user-profile`, `dashboard`

**Examples:**

```bash
feat(client): add request timeout configuration
fix(web): resolve hydration mismatch in dashboard
refactor(storage): simplify instance lifecycle
docs(readme): update installation instructions
test(api): add middleware integration tests
chore(deps): upgrade react-query to v6
```

### PR Workflow

1. **Create branch:** `git checkout -b feat/new-feature`
2. **Develop and commit**
3. **Push:** `git push -u origin feat/new-feature`
4. **Create PR:** `gh pr create --fill`
5. **Wait for CI** - all checks must pass
6. **Merge:** `gh pr merge --squash --delete-branch`

### Common Git Tasks

**Update branch:**

```bash
git checkout main
git pull
git checkout feat/my-feature
git rebase main
```

**Amend last commit:**

```bash
git add -A
git commit --amend --no-edit
git push --force-with-lease
```

**Undo local changes:**

```bash
git checkout .           # Undo unstaged changes
git reset HEAD <file>    # Unstage file
git reset --hard HEAD    # Undo all changes (⚠️ destructive)
```

## Troubleshooting

### Build Failures

**Symptoms:** `vp run build` fails

**Check:**

1. Run `vp check` for type errors
2. Check for circular dependencies
3. Verify all import paths are correct
4. Review full error stack

### Test Failures

**Symptoms:** Tests fail or timeout

**Check:**

1. Run test file independently: `vp test run <file>`
2. Check for resource leaks (unclosed servers, connections)
3. Review test timeout settings
4. Look for race conditions

### Type Check Failures

**Symptoms:** `vp check:types` reports errors

**Check:**

1. Run `bun install` to ensure dependencies are current
2. Verify `tsconfig.json` inheritance chain
3. Confirm using workspace aliases for imports
4. Check for `any` type leakage

### Boundary Check Failures

**Symptoms:** `vp run check:boundaries` reports violations

**Common violations:**

```typescript
// ❌ Wrong examples
import { db } from "@raypx/db"; // in client code
import { helper } from "@raypx/client/src/utils"; // internal path
```

**Fix:** Use public exports and respect client/server boundaries

See [ARCHITECTURE.md](ARCHITECTURE.md) and [EXAMPLES.md](EXAMPLES.md).

## Engineering Conventions

Use ESM and strict TypeScript with `noUncheckedIndexedAccess`; do not use `any`.
Runtime packages output ESM and declarations. Separate `tsconfig.test.json`
checks source, tests, and engineering configuration without emitting files.
Engineering tools expose `.ts` entrypoints and need no initial build.
Declare workspace dependencies explicitly and use public exports; never import
another package's `src` or `dist`. Packages cannot depend on apps or form cycles.

The client may depend on `contracts`, and UI has no business workspace
imports. Client core source cannot import React, React Query, or the React
adapter through any path or reexport. Only `src/react` owns React dependencies;
Start-specific modules belong in web. Browser code cannot import server
packages, `env/server`, or Node/Bun built-ins. Engineering packages remain
`devDependencies` and cannot be imported by runtime source.

Web creates a QueryClient for each SSR router/request and preserves its browser
router's cache through navigation. Never put a shared server query cache at
module scope. SSR prefetches require request-aware query functions. Private
queries include account identity and are cleared when authentication changes.
UI hooks handle behavior such as debounce, not business requests or sessions.

Start generates `routeTree.gen.ts`; do not edit it. Web `.server.ts` modules
adapt server packages, alongside Start's import protection. Secrets stay on
the server, never use a `VITE_` prefix, and are not committed or logged.

Root `vite.config.ts` owns Vite+ lint, formatting, and staged checks.
Root `vitest.config.mts` owns test projects and coverage.
`.oxlintrc.json` is an optional standalone configuration, not the current
`vp lint` configuration. The TypeScript AST checker enforces dependencies,
public exports, browser isolation, and client core/React separation in both
`check:boundaries` and the full check. Test APIs import from `vite-plus/test`;
React tests use jsdom and server tests use Node. Do not add placeholder tests.

## Common Modification Flows

Begin product endpoints in `apps/web/src/features/<feature>/`: colocate their
contracts, browser clients, `.server.ts` implementations, and `hooks`, then bind
the Start route. Reuse shared HTTP boundaries and `requestJson`. Component
behavior hooks such as debounce belong in `ui/hooks`.

Promote data capabilities to `contracts`, client core, and `client/react` only
after demonstrated reuse across applications or independent consumers. Require
stable validated contracts, browser-safe transport, explicit framework adapters,
public exports, and meaningful tests/documentation. The shared client must work
without product routes, workflows, application stores, or server configuration.
Sharing among components of one product alone does not require a public package.
Keep product state and composition in web so client does not become an application store.
Start routing, providers, and SSR integration remain in web. Provider configuration requires
schema validation, explicit activation, readiness, disposal, and failure tests.

See [architecture references](ARCHITECTURE.md#references-for-these-boundaries)
for the specific boundaries borrowed from shadcn, LobeHub, and TanStack. Raypx
retains its existing TanStack Query implementation and new-york/Radix UI registry.

## Verification and Runtime

```sh
bun run check:env
bun install --frozen-lockfile
bun run setup
bun run check:runtime-env
bun run dev
bun run check:boundaries
bun run check
```

Development builds dependencies and starts watchers and Start on port 5173.
`check` and `verify` use the same ordered acceptance workflow. Environment,
dependencies, policy, formatting, boundaries, and unused-code checks run first;
builds precede typed lint and type checks, followed by tests, Storybook build,
and independent consumers. `policy` checks workspace registration, TypeScript
inheritance, and local documentation without writing files.
Production integration tests need built artifacts. Run `bun run build` then
`bun run start` for Nitro's Bun artifact. Production defaults to
`127.0.0.1:3000`; validated HOST/PORT and NITRO overrides configure the listener.
Run `bun run db:migrate` explicitly before enabling account features.
See [ENV.md](ENV.md), [TESTING.md](TESTING.md), and
[Reusable foundations](docs/FOUNDATIONS.md).

Use Conventional Commits. Preserve existing uncommitted content and distinguish
implemented capabilities from future extensions when updating documentation.
