# Contributing to Raypx

Thank you for your interest in contributing to Raypx! This document provides guidelines and instructions for contributing to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Code Style & Standards](#code-style--standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Project Structure](#project-structure)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful, inclusive, and professional in all interactions.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/raypx.git
   cd raypx
   ```
3. **Set up the upstream remote**:
   ```bash
   git remote add upstream https://github.com/raypx/raypx.git
   ```

## Development Setup

### Prerequisites

- **Node.js** >= 22.0.0
- **pnpm** >= 10.17.0
- **PostgreSQL** database
- **Redis** (optional, for caching)

### Initial Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm --filter @raypx/database run db:migrate

# Start development server
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

### Database Setup

```bash
# Open database GUI
pnpm --filter @raypx/database run db:studio

# Generate new migration
pnpm --filter @raypx/database run db:generate

# Run migrations
pnpm --filter @raypx/database run db:migrate
```

## Development Workflow

### 1. Create a Branch

Always create a new branch for your work:

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

**Branch Naming Convention:**
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/updates
- `chore/` - Maintenance tasks

### 2. Make Changes

- Write clean, maintainable code
- Follow the existing code style
- Add tests for new features
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run type checking
pnpm typecheck

# Run linter
pnpm check

# Format code
pnpm format

# Run tests
pnpm test

# Build to verify
pnpm run build
```

### 4. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/) specification:

```bash
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug in authentication"
git commit -m "docs: update README"
```

**Commit Types:**
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions/changes
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements
- `ci:` - CI/CD changes

**Important:** Keep commits professional. Do not include AI attribution or tool names in commit messages.

### 5. Push and Create Pull Request

```bash
# Push to your fork
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub with:
- Clear title and description
- Reference to related issues
- Screenshots (if UI changes)
- Test results

## Code Style & Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types - use proper types or `unknown`
- Prefer interfaces for object shapes
- Use type inference where possible
- Export types and interfaces explicitly

### React Components

- Use functional components with hooks
- Prefer named exports for components
- Use TypeScript for props
- Keep components focused and small
- Extract reusable logic into custom hooks

### File Organization

```
feature/
├── index.tsx          # Main component
├── components/       # Feature-specific components
├── hooks/            # Custom hooks
├── utils.ts          # Utility functions
└── types.ts          # Type definitions
```

### Naming Conventions

- **Components**: PascalCase (`UserProfile.tsx`)
- **Files**: kebab-case for utilities (`format-date.ts`)
- **Functions**: camelCase (`getUserData`)
- **Constants**: UPPER_SNAKE_CASE (`MAX_RETRIES`)
- **Types/Interfaces**: PascalCase (`UserData`)

### Code Formatting

We use [Biome](https://biomejs.dev/) for formatting and linting:

```bash
# Format code
pnpm format

# Check for issues
pnpm check
```

**Key Rules:**
- Use 2 spaces for indentation
- Use single quotes for strings
- Trailing commas in multi-line structures
- Semicolons are required
- Maximum line length: 100 characters

## Testing

### Writing Tests

- Write tests for new features and bug fixes
- Use [Vitest](https://vitest.dev/) for testing
- Place tests next to the code they test (`.test.ts` or `.spec.ts`)
- Aim for good coverage but focus on meaningful tests

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm coverage
```

### Test Structure

```typescript
import { describe, it, expect } from "vitest";

describe("FeatureName", () => {
  it("should do something", () => {
    // Arrange
    const input = "test";
    
    // Act
    const result = functionToTest(input);
    
    // Assert
    expect(result).toBe("expected");
  });
});
```

## Submitting Changes

### Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows the project's style guidelines
- [ ] All tests pass (`pnpm test`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm check`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Documentation is updated (if needed)
- [ ] Commit messages follow Conventional Commits
- [ ] PR description is clear and detailed

### PR Review Process

1. **Automated Checks**: CI will run tests, type checking, and linting
2. **Code Review**: Maintainers will review your code
3. **Feedback**: Address any feedback or requested changes
4. **Merge**: Once approved, your PR will be merged

### What Makes a Good PR?

- **Clear Description**: Explain what and why
- **Small Scope**: Focus on one thing at a time
- **Well Tested**: Include tests for new features
- **Documentation**: Update docs if needed
- **Backwards Compatible**: Don't break existing functionality

## Project Structure

### Monorepo Organization

```
raypx/
├── apps/              # Applications
│   ├── web/          # Main web application
│   └── docs/         # Documentation site
│
├── packages/         # Shared packages
│   ├── auth/         # Authentication
│   ├── db/           # Database layer
│   ├── trpc/         # API layer
│   ├── ui/           # UI components
│   └── ...
│
└── scripts/          # Build scripts
```

### Key Packages

- **@raypx/auth** - Authentication system
- **@raypx/database** - Database schema and migrations
- **@raypx/trpc** - Type-safe API layer
- **@raypx/ui** - UI component library
- **@raypx/billing** - Payment and subscription management

### Adding New Features

1. **Backend (tRPC)**: Add procedures in `packages/trpc/src/routers/`
2. **Frontend**: Add pages in `apps/web/src/routes/`
3. **Database**: Add schemas in `packages/db/src/schemas/`
4. **Components**: Add to `packages/ui/src/` or `apps/web/src/components/`

## Common Tasks

### Adding a New tRPC Route

```typescript
// packages/trpc/src/routers/example.ts
export const exampleRouter = {
  list: protectedProcedure
    .input(z.object({ page: z.number().default(1) }))
    .query(async ({ ctx, input }) => {
      // Implementation
    }),
};
```

### Adding a New Database Schema

```typescript
// packages/db/src/schemas/example.ts
export const example = pgTable("example", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  // ... fields
});
```

### Adding a New UI Component

```bash
# Use shadcn CLI
pnpm shadcn add button

# Or create manually in packages/ui/src/components/
```

## Getting Help

- **Documentation**: Check [README.md](README.md) and [CLAUDE.md](CLAUDE.md)
- **Issues**: Search [GitHub Issues](https://github.com/raypx/raypx/issues)
- **Discussions**: Use GitHub Discussions for questions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (Apache License 2.0).

---

Thank you for contributing to Raypx! 🎉

