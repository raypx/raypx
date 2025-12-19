# Claude Code Project Guidelines

> **Project:** Raypx - Modern full-stack AI-powered web application platform
> **Stack:** TanStack Start + React 19 + TypeScript + pnpm monorepo
> **Last Updated:** 2025-12-19

## Quick Start

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env  # Edit with your config

# Run migrations
pnpm --filter @raypx/database run migrate

# Start development
pnpm dev  # http://localhost:3000
```

## Key Commands

```bash
# Development
pnpm dev              # Start web app
pnpm docs:dev         # Start docs
pnpm email:dev        # Email template preview

# Build & Quality
pnpm run build            # Production build
pnpm typecheck        # Type check
pnpm check            # Lint (Biome)
pnpm format           # Format code
pnpm test             # Run tests

# Database
pnpm --filter @raypx/database run studio       # Database GUI
pnpm --filter @raypx/database run migrate      # Run migrations
pnpm --filter @raypx/database run generate     # Generate migrations

# Utilities
pnpm clean            # Clean artifacts
pnpm shadcn           # Add UI component
```

## Project Structure

```
raypx/
├── apps/
│   ├── web/          # Main TanStack Start app
│   ├── docs/         # Fumadocs site
│   └── email/        # Email template preview server
│
├── packages/         # Shared packages
│   ├── ai/           # AI/LLM providers (OpenAI, DeepSeek)
│   ├── analytics/    # Analytics (PostHog, GA)
│   ├── auth/         # Better Auth
│   ├── billing/      # Stripe integration
│   ├── bundler/      # Build utilities
│   ├── config/       # Configuration management
│   ├── core/         # Core utilities
│   ├── database/     # Drizzle ORM + PostgreSQL
│   ├── email/        # Email providers
│   ├── email-templates/ # React Email templates
│   ├── env/          # Environment validation
│   ├── logger/       # Logging utilities
│   ├── observability/ # Sentry error tracking
│   ├── rag/          # RAG (Retrieval Augmented Generation)
│   ├── redis/        # Redis client
│   ├── shared/       # Shared utilities
│   ├── storage/      # Storage providers (R2, etc.)
│   ├── trpc/         # tRPC API
│   ├── tsconfig/     # TypeScript configs
│   └── ui/           # shadcn/ui (60+ components)
└── tooling/          # Dev tools (Biome, etc.)
```

## Tech Stack

### Core
- **TanStack Start** 1.141.7 - Full-stack React framework
- **React** 19.2.3 - UI library
- **TypeScript** 5.9.3 - Type safety
- **Vite** 8.0.0-beta.1 - Build tool
- **pnpm** 10.26.1+ - Package manager
- **Turborepo** 2.6.3 - Monorepo orchestration

### Backend
- **Better Auth** 1.3.34 - Authentication
- **Drizzle ORM** 0.44.7 - Database ORM
- **PostgreSQL** - Primary database
- **tRPC** 11.7.1 - Type-safe APIs
- **Redis** 5.9.0 - Caching (optional)

### UI
- **Tailwind CSS** v4.1.18 - Styling
- **Radix UI** - Component primitives
- **shadcn/ui** - Component library
- **React Hook Form** 7.68.0 - Forms
- **Zod** 4.2.1 - Validation
- **Recharts** 3.6.0 - Charts

### Dev Tools
- **Biome** 2.3.10 - Linter/formatter (replaces ESLint + Prettier)
- **Vitest** 4.0.16 - Testing
- **Lefthook** 2.0.12 - Git hooks
- **Drizzle Kit** - Migrations

## Package Manager (pnpm)

**This project exclusively uses pnpm 10.26.1+**

```bash
# Add dependency to package
pnpm --filter web add <package>
pnpm --filter @raypx/ui add <package>

# Add dev dependency
pnpm --filter web add -D <package>

# Remove dependency
pnpm --filter web remove <package>

# Update dependencies
pnpm update --latest --interactive --recursive

# Run in all packages
pnpm -r run <script>
```

### Workspace Protocol
- **Catalog dependencies**: `"dep": "catalog:"` (centralized versions)
- **React 19**: `"react": "catalog:react19"`
- **Tailwind v4**: `"tailwindcss": "catalog:tailwindv4"`
- **Internal packages**: `"@raypx/ui": "workspace:*"`

## Build System (Turborepo)

**IMPORTANT: Only `apps/` should have build scripts**

- ✅ `apps/web`, `apps/docs` - Have build scripts (deployable)
- ❌ `packages/*` - NO build scripts (consumed as TypeScript source)

All packages are consumed directly as TypeScript source files by applications. No build step required for packages.

## Environment Variables

137+ environment variables organized in categories:
- App Configuration (NODE_ENV, PORT, APP_URL)
- Feature Flags (13 vars)
- Database (DATABASE_URL)
- Redis (REDIS_URL)
- Authentication (Better Auth + OAuth)
- Analytics (PostHog, Google Analytics)
- Payment (Stripe)
- AI Services (OpenAI, DeepSeek)

**Required:**
```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/raypx
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
BETTER_AUTH_URL=http://localhost:3000
```

**Validation:** Uses `@raypx/env` package with Zod for type-safe env vars.

## Development Workflow

### Adding Features

```bash
# 1. Create branch
git checkout -b feature/my-feature

# 2. Implement & test
pnpm typecheck
pnpm check
pnpm format
pnpm test

# 3. Build to verify
pnpm run build

# 4. Commit
git commit -m "feat: add my feature"
```

### Code Validation

**Always run full build before committing:**
```bash
pnpm run build  # Verifies TypeScript, dependencies, routes, assets
```

Build time: 10-15 seconds for full production build.

## Git Workflow

### Commit Convention (Conventional Commits)

```
<type>(<scope>): <description>
```

**Types:** `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`, `ci`

**Examples:**
```bash
git commit -m "feat(auth): add OAuth support"
git commit -m "fix(ui): resolve button hover"
git commit -m "docs: update setup guide"
```

**IMPORTANT:** No AI attribution in commits (❌ "Generated with Claude Code")

## Code Quality

### Biome (NOT ESLint/Prettier)
```bash
pnpm check    # Lint
pnpm format   # Format
```

### TypeScript
- Strict mode enabled
- ESNext target
- Prefer `type` over `interface`
- Avoid `any`, use `unknown`

### Testing (Vitest)
```bash
pnpm test              # Run all tests
pnpm test --watch      # Watch mode
pnpm coverage          # Coverage report
```

## Troubleshooting

### Build Failures
```bash
pnpm clean && rm -rf node_modules && pnpm install
rm -rf apps/web/.tanstack apps/web/.nitro apps/web/dist
pnpm run build
```

### Database Issues
```bash
pnpm --filter @raypx/database run studio      # Inspect DB
pnpm --filter @raypx/database run migrate     # Run migrations
```

### TypeScript Errors
1. Restart TS server (VS Code: Cmd+Shift+P → "Restart TS Server")
2. Clear cache: `rm -rf tsconfig.tsbuildinfo && pnpm typecheck`
3. Reinstall: `pnpm install`

### Common Errors
- **"Cannot find module '@raypx/...'"** → `pnpm install`
- **"Port 3000 in use"** → `lsof -ti:3000 | xargs kill -9`
- **"Type error in node_modules"** → `rm -rf node_modules && pnpm install`

## Deployment

**Supported Platforms:** Netlify, Vercel, Cloudflare Workers, Self-hosted

### Build Output
```bash
pnpm run build

apps/web/dist/client/   # Client assets
apps/web/dist/server/   # Server code
apps/web/.netlify/      # Netlify files
```

### Pre-deployment Checklist
- [ ] Tests pass (`pnpm test`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Environment variables configured
- [ ] Database migrations run

## Project Standards

### Language
**All code comments, docs, and commits MUST be in English.**

### TypeScript
- Strict mode enabled
- Prefer `type` over `interface`
- Avoid `any`, use `unknown`
- Export types with `export type`

### React
- Function components with hooks
- Named exports (not default)
- Keep components small and focused
- Use React 19 features

### Styling
- Tailwind utility classes
- Minimal custom CSS
- Mobile-first responsive design
- CSS variables for theming

### API Design
- tRPC for type-safe APIs
- Zod input validation
- Focused procedures
- Proper error codes

## Documentation Guidelines

### Location
**All project documentation MUST be placed in `apps/docs/content/docs/`**

- ✅ `apps/docs/content/docs/oauth-setup.mdx` - OAuth setup guide
- ✅ `apps/docs/content/docs/development.mdx` - Development workflow
- ❌ `docs/` - Do NOT use root-level docs directory
- ❌ `packages/*/docs/` - Do NOT use package-level docs

### Format Requirements

Documentation files must use **MDX format** with proper frontmatter:

```mdx
---
title: Your Page Title
description: Brief description of the content
---

Your content here...
```

### Ordering Documentation

Control the order of documentation pages using `meta.json` in the docs directory:

```json
{
  "title": "Documentation",
  "pages": [
    "index",
    "workspace",
    "development",
    "---Authentication---",
    "oauth-setup"
  ]
}
```

**Syntax:**
- `"page-name"` - Include page (without .mdx extension)
- `"---Section Name---"` - Add separator with label
- `"..."` - Include remaining pages alphabetically
- `"!excluded-page"` - Exclude specific page from rest operator
- `"[External Link](https://example.com)"` - Add external link

### Best Practices

- Use descriptive kebab-case filenames (e.g., `oauth-setup.mdx`, `database-setup.mdx`)
- Include proper frontmatter with title and description
- Use code blocks with language tags and titles
- Link to related documentation using relative paths
- Keep documentation up-to-date with code changes
- Update `meta.json` when adding new documentation pages

## Resources

### Documentation
- **Fumadocs**: `/docs` route in web app
- **Project Docs**: `apps/docs/content/docs/`
- **Examples**: `apps/web/src/routes/`

### External Links
- [TanStack Start](https://tanstack.com/start)
- [TanStack Router](https://tanstack.com/router)
- [Drizzle ORM](https://orm.drizzle.team)
- [Better Auth](https://better-auth.com)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [Biome](https://biomejs.dev)
- [Fumadocs](https://fumadocs.vercel.app)

---

## Recent Changes

### 2025-12-19 - Project Cleanup and Updates
- Removed tsdown build tool (all packages now use TypeScript source directly)
- Removed @vercel/analytics integration
- Updated Vite to 8.0.0-beta.1
- Updated pnpm to 10.26.1
- Updated Recharts to 3.6.0 with API compatibility fixes
- Removed @raypx/vite package (no longer needed)
- Added Docker VS Code extension recommendation
- Cleaned up documentation and configuration files

### 2025-11-20 - Project Structure Updates
- Removed `apps/server` package (no longer needed)
- Updated project structure documentation
- Optimized changeset configuration with custom commit message

### 2025-11-13 - Documentation Guidelines
- Added documentation guidelines section to CLAUDE.md
- Standardized documentation location: `apps/docs/content/docs/`
- Added MDX format requirements and best practices
- Created OAuth setup guide in proper location

### 2025-11-12 - Documentation Regeneration
- Complete CLAUDE.md regeneration based on actual project structure
- Removed i18n documentation (package retained for future use)
- Updated tech stack with accurate version numbers

---

**Maintained By:** Raypx Team | **License:** Apache-2.0
