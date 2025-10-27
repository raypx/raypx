# Claude Code Project Guidelines

> **Project:** Raypx - A modern full-stack web application
> **Last Updated:** 2025-10-28
> **Stack:** TanStack Start + React 19 + TypeScript + pnpm monorepo

## Quick Start

### Development Commands

```bash
# Install dependencies
pnpm install

# Start development server (web app only)
pnpm dev

# Start specific package
pnpm --filter web dev
pnpm --filter @raypx/db run db:studio

# Build for production
pnpm build

# Type checking
pnpm typecheck

# Linting and formatting
pnpm check
pnpm format

# Run tests
pnpm test
pnpm coverage

# Clean build artifacts
pnpm clean
```

### Database Commands

```bash
# Open Drizzle Studio
pnpm --filter @raypx/db run db:studio

# Run migrations
pnpm --filter @raypx/db run db:migrate

# Generate migrations
pnpm --filter @raypx/db run db:generate

# Push schema changes
pnpm --filter @raypx/db run db:push

# Seed database
pnpm --filter @raypx/db run db:seed
```

## Project Structure

```
raypx/
├── apps/
│   └── web/                    # TanStack Start application
│       ├── inlang/             # i18n configuration
│       │   └── settings.json   # Locales: en, zh
│       ├── messages/           # Translation files
│       │   ├── en.json
│       │   └── zh.json
│       ├── public/             # Static assets
│       ├── src/
│       │   ├── app/            # File-based routes
│       │   ├── components/     # React components
│       │   ├── hooks/          # Custom React hooks
│       │   ├── lib/            # Utilities and helpers
│       │   ├── styles/         # Global styles
│       │   ├── env.ts          # Environment validation
│       │   ├── router.tsx      # Router configuration
│       │   └── server.ts       # Server entry point
│       └── vite.config.ts
│
├── packages/                   # Shared packages
│   ├── analytics/              # Analytics integration
│   ├── auth/                   # Better Auth configuration
│   ├── cli/                    # CLI utilities
│   ├── db/                     # Drizzle ORM + PostgreSQL
│   ├── email/                  # Email templates (React Email)
│   ├── env/                    # Environment validation
│   ├── i18n/                   # i18n utilities and Vite plugin
│   ├── redis/                  # Redis client
│   ├── shared/                 # Shared utilities
│   ├── trpc/                   # tRPC server setup
│   ├── tsconfig/               # Shared TypeScript configs
│   ├── ui/                     # UI components (shadcn/ui)
│   └── validators/             # Zod schemas
│
├── scripts/                    # Build and development scripts
├── .claude/                    # Claude Code configuration
├── .github/                    # GitHub Actions workflows
└── turbo/                      # Turborepo configuration
```

## Package Manager

**This project exclusively uses pnpm 10.19.0+**

### Why pnpm?

- ⚡ **Fast**: Efficient dependency resolution and installation
- 💾 **Disk Efficient**: Uses hard links and symlinks
- 📦 **Monorepo Support**: Native workspace protocol
- 🔒 **Strict**: Prevents phantom dependencies
- 🎯 **Catalog**: Centralized dependency management

### Key Commands

```bash
# Install dependencies
pnpm install

# Add dependency to specific package
pnpm --filter web add <package>
pnpm --filter @raypx/ui add <package>

# Add dev dependency
pnpm --filter web add -D <package>

# Remove dependency
pnpm --filter web remove <package>

# Update dependencies
pnpm update --recursive --interactive --latest

# Run command in specific package
pnpm --filter web run <script>

# Run command in all packages
pnpm -r run <script>
```

### Workspace Protocol

- **Catalog dependencies**: `"dep": "catalog:"` - Managed in root `package.json`
- **React 19 deps**: `"react": "catalog:react19"`
- **Tailwind v4**: `"tailwindcss": "catalog:tailwindv4"`
- **Internal packages**: `"@raypx/ui": "workspace:*"`

## Build System

### Turborepo Configuration

The monorepo uses Turborepo for efficient builds and caching:

- **Pipeline**: Defined in `turbo.json`
- **Cache**: `.turbo/` directory (gitignored)
- **Parallel execution**: Automatic task parallelization
- **Remote caching**: Can be configured for team collaboration

### Build Rules

**IMPORTANT: Only `apps/` should have build scripts**

- ✅ `apps/web` - Has `build`, `dev` scripts (deployable app)
- ❌ `packages/*` - NO build scripts (consumed as TypeScript source)

All packages are consumed directly as TypeScript source files by applications. They do not need compilation or build steps.

**Exception**: Packages may have build scripts if they export compiled code (e.g., CLI tools), but this should be rare.

## Tech Stack

### Core Framework

- **TanStack Start** ^1.133.27 - Full-stack React framework with SSR/SSG
- **TanStack Router** ^1.133.27 - Type-safe file-based routing
- **React 19** - Latest React with concurrent features
- **TypeScript 5.9+** - Strict type safety
- **Vite 7.1+** - Lightning-fast build tool with HMR

### Backend & Data

- **Better Auth** - Modern authentication library
  - Session management
  - OAuth providers
  - Email/password auth
  - 2FA support
- **PostgreSQL + Drizzle ORM** - Type-safe database
  - Schema definition in TypeScript
  - Automatic migrations
  - Type-safe queries
- **tRPC 11.7+** - End-to-end type-safe APIs
  - No code generation
  - Automatic type inference
  - React Query integration
- **Redis** - Caching and session storage
- **Nitro** - Universal server framework

### UI & Styling

- **Tailwind CSS v4** - Utility-first CSS framework
  - Vite plugin for instant compilation
  - Modern CSS features
  - JIT compiler
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Component library (via @raypx/ui)
  - Customizable components
  - Copy-paste components
  - Full TypeScript support
- **Lucide React** - Icon library
- **React Hook Form** - Form state management
- **Zod** - Schema validation

### Internationalization (i18n)

- **inlang/paraglide-js** ^2.4.0 - Compile-time i18n
  - Zero runtime overhead
  - Type-safe translations
  - Auto-generated message functions
  - Vite plugin integration
- **Supported locales**: English (en), Chinese (zh)
- **Message format**: JSON-based translation files
- **URL strategy**: `/en/path` and `/zh/path`

### Development Tools

- **pnpm** 10.19.0+ - Fast package manager
- **Turborepo** ^2.5.8 - Monorepo build system
- **Biome** - Fast linter and formatter (replaces ESLint + Prettier)
- **Vitest** - Unit testing framework
- **Lefthook** - Fast git hooks
- **TypeScript** 5.9+ - Type checking
- **dotenvx** - Environment variable management
- **knip** - Find unused files and dependencies

### Documentation

- **Fumadocs** ^16.0.4 - Documentation framework
  - MDX support
  - Built-in search
  - Beautiful UI
  - API reference generation

## Code Quality

### Linting and Formatting

**This project uses Biome** (NOT ESLint/Prettier)

```bash
# Check code quality
pnpm check

# Format code
pnpm format

# Format specific files
pnpm format <glob-pattern>
```

**Biome Configuration**: See `biome.json`
- Tailwind directive support enabled
- Strict linting rules
- Consistent formatting
- Fast performance

### Type Checking

```bash
# Type check all packages
pnpm typecheck

# Type check with Turbo (uses cache)
pnpm turbo typecheck
```

### Git Hooks

Configured via `lefthook.yml`:

- **pre-commit**: Runs formatting on staged files
- Fast execution (faster than husky)
- No npm dependency

### Testing

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test --watch

# Run tests with coverage
pnpm coverage

# Run tests for specific package
pnpm --filter web test
```

**Test Framework**: Vitest
- Fast and modern
- Compatible with Jest API
- Built-in TypeScript support
- Coverage with v8

## Internationalization (i18n)

### Architecture

The i18n system uses **compile-time translation** with zero runtime overhead:

```
┌─────────────────────────────────────────────┐
│ Build Time (Vite Plugin)                    │
│ ├── messages/en.json                        │
│ ├── messages/zh.json                        │
│ └── inlang/settings.json                    │
│     ↓ paraglide compiler                    │
│ └── node_modules/.raypx/paraglide/          │
│     ├── messages.js (type-safe functions)   │
│     └── runtime.js (locale management)      │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│ Runtime (@raypx/i18n virtual modules)       │
│ ├── @raypx/i18n/runtime                     │
│ ├── @raypx/i18n/server                      │
│ └── @raypx/i18n/messages                    │
└─────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────┐
│ Application (@raypx/ui components)          │
│ └── useLocale('namespace')                  │
└─────────────────────────────────────────────┘
```

### Key Benefits

1. **Zero Runtime Overhead**
   - No i18n library loaded in browser
   - ~100KB smaller bundle vs i18next
   - All translations compiled at build time

2. **Full Type Safety**
   - Auto-generated TypeScript types
   - Compile-time errors for missing translations
   - IDE autocomplete for all keys

3. **Clean Architecture**
   - Dependency Inversion Principle
   - @raypx/ui provides abstraction
   - Easy to swap implementation

### Configuration

**i18n Vite Plugin** (`@raypx/i18n/vite`)

```typescript
// apps/web/vite.config.ts
import i18nPlugin from "@raypx/i18n/vite";

export default defineConfig({
  plugins: [
    await i18nPlugin({
      outputStructure: "message-modules", // or "locale-modules"
      cookieName: "lang",                 // cookie name for locale
      strategy: [                          // locale detection strategy
        "url",                             // /en/path, /zh/path
        "cookie",                          // lang cookie
        "preferredLanguage",               // Accept-Language header
        "baseLocale"                       // fallback to en
      ],
      inlangDir: "inlang",                // inlang config directory
      cacheDir: "node_modules/.raypx",    // compiled output cache
    }),
  ],
});
```

**Default Configuration** (`I18N_DEFAULTS`)

All options are optional. Defaults from `@raypx/i18n/vite`:

```typescript
export const I18N_DEFAULTS = {
  outputStructure: "message-modules",
  cookieName: "lang",
  strategy: ["url", "cookie", "preferredLanguage", "baseLocale"],
  inlangDir: "inlang",
  cacheDir: "node_modules/.raypx",
};
```

### Usage in Components

```typescript
import { useLocale } from '@raypx/ui/hooks/use-locale';

function MyComponent() {
  const { t, locale, setLocale } = useLocale('home');

  return (
    <div>
      <h1>{t('hero.title')}</h1>
      <p>{t('hero.description')}</p>
      <button onClick={() => setLocale('zh')}>
        切换到中文
      </button>
    </div>
  );
}
```

### Translation Files

```json
// messages/en.json
{
  "home": {
    "hero": {
      "title": "Welcome to Raypx",
      "description": "Build faster with modern tools"
    }
  }
}

// messages/zh.json
{
  "home": {
    "hero": {
      "title": "欢迎来到 Raypx",
      "description": "使用现代工具快速构建"
    }
  }
}
```

### Adding New Languages

1. **Update inlang configuration:**

```json
// apps/web/inlang/settings.json
{
  "baseLocale": "en",
  "locales": ["en", "zh", "ja", "ko"]  // add new locales
}
```

2. **Create translation files:**

```bash
cp messages/en.json messages/ja.json
# Then translate the content manually or use machine translation
```

3. **Update locale constants (if needed):**

```typescript
// packages/i18n/src/index.ts
export const locales = ["en", "zh", "ja", "ko"];
```

4. **Machine translate missing keys:**

```bash
pnpm --filter web run machine-translate
```

### URL Routing

The i18n middleware automatically handles locale-based URLs:

- `/` → redirects to `/en/` (based on detection strategy)
- `/en/about` → English about page
- `/zh/about` → Chinese about page
- `/api/*` → No locale prefix (API routes skip i18n)
- `/docs/*` → Documentation routes (configurable)

**Smart Path Filtering**: The server middleware skips i18n processing for:
- API routes: `/api/*`, `/.well-known/*`, `/_*`
- Static assets: `.js`, `.css`, images, fonts
- Non-GET requests

### Server-Side i18n

```typescript
// apps/web/src/server.ts
import { paraglideMiddleware } from "@raypx/i18n/server";

export default {
  fetch(req: Request) {
    const { pathname } = new URL(req.url);

    // Skip i18n for API and static assets
    if (req.method !== "GET" || shouldSkipI18n(pathname)) {
      return handler.fetch(req);
    }

    // Apply i18n middleware for all GET requests
    return paraglideMiddleware(req, ({ request }) => handler.fetch(request));
  },
};
```

## Environment Configuration

### Environment Files

```bash
.env                # Local development (gitignored)
.env.example        # Template for required variables (committed)
```

### Environment Validation

Powered by `@raypx/env` package using `@t3-oss/env-core`:

```typescript
// apps/web/src/env.ts
import { createEnv } from "@raypx/env";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional(),
  },
  client: {
    // Public env vars (prefixed with VITE_)
  },
  shared: {
    NODE_ENV: z.enum(["development", "production", "test"]),
  },
});
```

**Benefits:**
- Type-safe environment variables
- Runtime validation
- Build-time errors for missing vars
- Separate server/client vars
- Great DX with autocomplete

### Required Variables

See `.env.example` for the complete list. Key variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/raypx

# Auth
BETTER_AUTH_SECRET=your-secret-key-here
BETTER_AUTH_URL=http://localhost:3000

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Email (optional)
RESEND_API_KEY=re_xxx
```

## Development Workflow

### Starting Development

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment variables
cp .env.example .env

# 3. Start database (Docker)
docker compose up -d

# 4. Run migrations
pnpm --filter @raypx/db run db:migrate

# 5. Start dev server
pnpm dev
```

The dev server will start at `http://localhost:3000`.

### Adding New Features

1. **Create feature branch**

```bash
git checkout -b feature/my-feature
```

2. **Implement feature**
   - Add code to appropriate package
   - Add tests
   - Update types

3. **Validate changes**

```bash
# Type check
pnpm typecheck

# Lint and format
pnpm check
pnpm format

# Run tests
pnpm test

# Build to verify
cd apps/web && pnpm run build
```

4. **Commit changes**

```bash
git add .
git commit -m "feat: add my feature"
```

### Code Change Validation

**IMPORTANT: Always validate changes with a full build**

```bash
# From project root
cd apps/web && pnpm run build
```

This should be done:
- After modifying package structure
- After updating imports/exports
- After refactoring shared code
- Before committing significant changes

The build process verifies:
- TypeScript compilation
- Dependency resolution
- Route generation
- Asset bundling

**Build Performance**: Typical build time is 9-13 seconds for full production build.

## Git Workflow

### Commit Convention

This project follows **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

**Examples:**

```bash
git commit -m "feat(auth): add OAuth login support"
git commit -m "fix(ui): resolve button hover state"
git commit -m "docs: update i18n setup guide"
git commit -m "refactor(db): optimize user queries"
```

### Git Hooks

**Lefthook** manages git hooks (see `lefthook.yml`):

- **pre-commit**: Auto-format staged files
  - Fast execution with native binaries
  - Only formats changed files
  - Skips if no matching files

### Commit Message Guidelines

**IMPORTANT: No AI attribution in commit messages**

- ❌ Don't include "Generated with Claude Code"
- ❌ Don't include "Co-Authored-By: Claude"
- ✅ Keep messages professional and technical
- ✅ Describe the actual changes made

Record AI assistance in `CLAUDE.md` instead, not in git history.

## Debugging and Troubleshooting

### Build Failures

```bash
# Clear all caches and reinstall
pnpm clean && rm -rf node_modules && pnpm install

# Clear Vite cache
rm -rf apps/web/.tanstack apps/web/.nitro apps/web/dist

# Clear Turbo cache
rm -rf .turbo && pnpm turbo clean
```

### Database Issues

```bash
# Check database connection
pnpm --filter @raypx/db run db:check

# Reset database (development only!)
pnpm --filter @raypx/db run db:reset

# Re-run migrations
pnpm --filter @raypx/db run db:migrate
```

### TypeScript Errors

1. **Restart TypeScript server in your editor**
   - VS Code: `Cmd/Ctrl + Shift + P` → "TypeScript: Restart TS Server"

2. **Check for circular dependencies**
   - Look for import cycles
   - Use `knip` to find issues

3. **Verify package dependencies**
   ```bash
   pnpm install
   pnpm typecheck
   ```

### Performance Issues

**Development:**
- Vite provides instant HMR out of the box
- Use `pnpm dev --filter web` to run only web app
- TanStack DevTools available in development

**Production:**
- Vite auto-optimizes bundles
- Use lighthouse for performance audits
- Monitor Web Vitals

### Common Errors

**"Cannot find module '@raypx/...'"**
- Run `pnpm install` to ensure workspace links are created
- Check `package.json` has correct `workspace:*` reference

**"Type error in node_modules"**
- This is usually a dependency type issue
- Try `rm -rf node_modules && pnpm install`

**"Port 3000 already in use"**
- Kill the process: `kill -9 $(lsof -ti:3000)`
- Or change port in `vite.config.ts`

## Deployment

### Supported Platforms

- **Netlify** - Configured with `@netlify/vite-plugin-tanstack-start`
- **Vercel** - Compatible with TanStack Start
- **Self-hosted** - Via Docker or Node.js

### Build Output

```bash
# Production build
pnpm build

# Output locations
apps/web/dist/client/   # Client-side assets
apps/web/dist/server/   # Server-side code
apps/web/.netlify/      # Netlify deployment files
```

### Environment Variables

Ensure all required environment variables are set in your deployment platform:

```bash
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=prod-secret-key
BETTER_AUTH_URL=https://yourdomain.com
REDIS_URL=redis://...
```

### Pre-deployment Checklist

- [ ] All tests passing (`pnpm test`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL/TLS certificates valid

## Documentation Maintenance

### CLAUDE.md (This File)

Record project guidelines and architecture decisions here.

### TODO.md

Track planned features and improvements. Mark completed items with `[x]`.

### Recent Architecture Improvements

Document significant changes in this section for future reference.

---

## Recent Architecture Improvements

### 2025-10-28 - i18n Infrastructure Optimization

**Commits:**
- `1db93b6` - refactor(i18n): optimize vite plugin with better defaults and configuration
- `323dfb6` - refactor: remove redundant @raypx/vite package
- `a4862fa` - feat(i18n,vite): refactor i18n infrastructure with compile-time approach

**Changes:**

1. **Removed redundant @raypx/vite package**
   - Eliminated 239 lines of duplicate code
   - Consolidated i18n Vite plugin into `@raypx/i18n/vite`
   - Simplified package dependency graph
   - Clearer single responsibility per package

2. **Optimized @raypx/i18n/vite plugin**
   - Added `I18N_DEFAULTS` constant for centralized configuration
   - Made all options optional with sensible defaults
   - Added support for custom `inlangDir` and `cacheDir` paths
   - Unified configuration between compile and plugin init
   - Fixed error handling to properly propagate build failures
   - Updated documentation to reflect actual file paths

3. **Improved type safety and flexibility**
   - All config parameters now optional
   - Better IDE autocomplete and type inference
   - Easier testing with exported defaults
   - More flexible for different project structures

**Impact:**
- ✅ Cleaner architecture following single responsibility principle
- ✅ Reduced code duplication and maintenance burden
- ✅ Better developer experience with flexible configuration
- ✅ Improved error handling and debugging
- ✅ Build time remains fast (~9-13s for full build)
- ✅ Zero breaking changes to existing API

**Before:**
```typescript
// Had two places defining the same plugin
packages/vite/src/plugin.ts       // 114 lines - REMOVED
packages/i18n/src/vite.ts          // 131 lines - KEPT & IMPROVED
```

**After:**
```typescript
// Single source of truth
packages/i18n/src/vite.ts          // 118 lines, better organized

// Usage (all options optional)
import i18nPlugin from "@raypx/i18n/vite";
await i18nPlugin({
  outputStructure: "message-modules",
  inlangDir: "inlang",
  // ... other optional config
})
```

---

## Project Standards

### Code Comments

**All code comments, documentation, and technical writing MUST be in English.**

This strict requirement applies to:
- Code comments (inline, block, JSDoc)
- Documentation files
- Commit messages
- Pull request descriptions
- Issue descriptions
- Configuration comments

**Why English?**
- International collaboration
- Industry standard
- AI tooling compatibility
- Wider audience accessibility

### TypeScript

- Use **strict mode** enabled
- Prefer `type` over `interface` for object shapes
- Use `const` assertions for literal types
- Avoid `any` - use `unknown` if needed
- Export types with `export type`

### React

- Use **function components** with hooks
- Prefer named exports over default exports
- Use TypeScript for prop types
- Keep components focused and small
- Extract custom hooks for reusable logic

### Styling

- Use **Tailwind utility classes**
- Keep custom CSS minimal
- Use CSS variables for theming
- Follow mobile-first responsive design
- Use semantic HTML elements

## Support and Resources

### Documentation

- **Fumadocs**: `/docs` route in web app
- **API Reference**: Auto-generated from code
- **Examples**: See `apps/web/src/app/` for patterns

### External Links

- **TanStack Start**: https://tanstack.com/start
- **TanStack Router**: https://tanstack.com/router
- **Drizzle ORM**: https://orm.drizzle.team
- **Better Auth**: https://better-auth.com
- **inlang/paraglide**: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
- **Tailwind CSS v4**: https://tailwindcss.com/docs

### Getting Help

1. Check this CLAUDE.md first
2. Search existing issues
3. Check package documentation
4. Create new issue with reproduction

---

**Last Updated**: 2025-10-28
**Maintained By**: Raypx Team
**License**: Apache-2.0
