# Raypx Project - Claude Code Instructions

## Tech Stack
- **Monorepo**: Turborepo with pnpm workspace
- **Frontend**: Next.js 16, React 19, TypeScript
- **UI**: Tailwind CSS + shadcn/ui
- **Code Quality**: Biome (linter & formatter)
- **Package Manager**: pnpm only (never use npm/yarn)

## Code Style (Biome Configuration)
- 2 spaces indentation, 100 char line width
- Always use semicolons and double quotes
- Use `import type` for type-only imports
- Auto-organize imports and sort Tailwind classes
- Prefer explicit types, avoid `any`
- Use self-closing JSX elements when possible

## Development Commands
```bash
# Install dependencies
pnpm install

# Development
pnpm dev              # All apps
pnpm dev:app          # App only
pnpm dev:web          # Web only

# Build & Check
pnpm build
pnpm lint             # Biome check
pnpm format           # Biome format
pnpm typecheck        # TypeScript check

# Testing
pnpm test
```

## File Structure
```
apps/
  app/               # Next.js app application
  web/               # Next.js web application
  api/               # API server
  desktop/           # Desktop application
  docs/              # Documentation
packages/
  ui/                # Shared UI components
  config/            # Shared configs
  env/               # Environment variables
```

## Important Rules
- Use Biome for linting/formatting (not ESLint/Prettier)
- Check existing shadcn/ui components before creating new ones
- Follow existing code patterns in the codebase
- Always run `pnpm lint` and `pnpm format` before committing
- For UI: use Tailwind classes, no inline styles
- Use absolute imports with `@/` prefix
