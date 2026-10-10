# Contributing to Raypx

Thank you for your interest in contributing to Raypx! 🎉

## Getting Started

### Prerequisites

- **Bun** 1.4.2, matching `.bun-version`
- **Node.js** 22.22.1, matching `.node-version` (including Vite+ staged checks)
- **Git** 2.32.0 or later

### Setup

1. **Fork and clone**

   ```bash
   git clone https://github.com/YOUR_USERNAME/raypx.git
   cd raypx
   ```

2. **Install dependencies**

   ```bash
   bun install
   ```

3. **Create application configuration**

   ```bash
   bun run setup
   bun --no-env-file run doctor
   ```

4. **Start development**

   ```bash
   bun run dev
   ```

5. **Verify everything works**
   ```bash
   bun run check
   ```

## Development Workflow

### Commit Hooks

`bun install` installs Vite+ hooks through the root `prepare` script. The
`.vite-hooks/pre-commit` hook checks the development environment and runs
`vp staged` with rules from root `vite.config.ts`. It fixes lint and formatting
for staged files, adds fixes to the index, and preserves unstaged changes.
Run `bun run staged` to check manually and `bun run vp hooks status` to inspect
the installed dispatcher. Full acceptance remains `bun run check`.

Existing clones can run `bun run prepare` to install hooks. To disable hooks
locally, run `bun run vp hooks disable`; use `bun run vp hooks enable` to restore
them. Commit `.vite-hooks/pre-commit` and ignore the generated `.vite-hooks/_/`.

### Branch Naming

- `feat/feature-name` - New features
- `fix/bug-description` - Bug fixes
- `docs/what-changed` - Documentation
- `refactor/what-improved` - Code improvements
- `test/what-tested` - Test additions

### Making Changes

1. **Create a branch**

   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make your changes**
   - Write clean, readable code
   - Follow existing patterns
   - Add tests for new features
   - Update documentation

3. **Test your changes**

   ```bash
   bun run test        # Run tests
   bun run typecheck   # Check types
   bun run lint        # Check code quality
   ```

4. **Commit with clear messages**

   ```bash
   git commit -m "feat: add user profile page"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation
   - `refactor:` - Code refactoring
   - `test:` - Tests
   - `chore:` - Maintenance

5. **Push and create PR**
   ```bash
   git push origin feat/your-feature
   ```

## Code Style

### TypeScript

- Use **strict mode** (already configured)
- Prefer `interface` over `type` for objects
- Use `const` by default
- Avoid `any` - use `unknown` if needed

### Naming Conventions

- **Files**: `kebab-case.ts`
- **Components**: `PascalCase.tsx`
- **Functions**: `camelCase()`
- **Constants**: `UPPER_SNAKE_CASE`
- **Types/Interfaces**: `PascalCase`

### Comments

- Add JSDoc for public APIs
- Explain **why**, not **what**
- Keep comments up-to-date

````typescript
/**
 * Fetches user profile with caching
 *
 * @param userId - User ID to fetch
 * @returns User profile or null if not found
 *
 * @example
 * ```typescript
 * const user = await getUser('123');
 * ```
 */
export async function getUser(userId: string) {
  // Cache implementation...
}
````

## Testing

### Unit Tests

```typescript
// packages/db/test/database.test.ts
import { describe, it, expect } from "vite-plus/test";
import { createDatabase } from "@raypx/db";

describe("Database", () => {
  it("should connect successfully", () => {
    const connection = createDatabase(":memory:");
    try {
      expect(() => connection.checkHealth()).not.toThrow();
    } finally {
      connection.close();
    }
  });
});
```

### Running Tests

```bash
bun run test               # Workspace tests and server integration
bun run test:watch         # Watch mode
bun run test:coverage      # With coverage
bun run vp run @raypx/db#test # Specific package
bun run test:e2e           # Application Chromium tests
bun run test:consumer:browser # Independent UI consumer
```

## Package Development

### Adding a New Package

1. Create package directory

   ```bash
   mkdir -p packages/my-package/src
   ```

2. Add `package.json`

   ```json
   {
     "name": "@raypx/my-package",
     "version": "0.1.0",
     "type": "module",
     "exports": {
       ".": {
         "types": "./dist/index.d.ts",
         "import": "./dist/index.js"
       }
     }
   }
   ```

3. Add to workspace if needed

### Package Dependencies

- Use `workspace:*` for internal packages
- Use `catalog:` for shared external deps
- Keep packages focused and minimal

## Pull Request Process

### Before Submitting

- [ ] Tests pass (`bun run test`)
- [ ] Type check passes (`bun run typecheck`)
- [ ] Linter passes (`bun run lint`)
- [ ] Unused-code audit passes (`bun run check:unused`)
- [ ] Independent package consumers pass (`bun run check:consumer`)
- [ ] Documentation updated
- [ ] No merge conflicts

### PR Description Template

```markdown
## Description

Brief description of changes

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

How to test these changes

## Screenshots (if applicable)
```

### Review Process

1. Automated checks must pass
2. At least one maintainer approval
3. No unresolved conversations
4. Squash merge preferred

## Reporting Bugs

Use GitHub Issues with:

1. **Clear title** - Describe the bug briefly
2. **Steps to reproduce**
3. **Expected behavior**
4. **Actual behavior**
5. **Environment** (OS, Bun version, etc.)
6. **Screenshots** (if applicable)

## Suggesting Features

Create an issue with:

1. **Problem statement** - What problem does it solve?
2. **Proposed solution** - How should it work?
3. **Alternatives** - Other approaches considered
4. **Examples** - Similar features in other projects

## Questions?

- Check [documentation](./docs/)
- Search [existing issues](https://github.com/YOUR_USERNAME/raypx/issues)
- Ask in [GitHub Discussions](https://github.com/YOUR_USERNAME/raypx/discussions)

## Code of Conduct

Be respectful, inclusive, and professional. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

---

Thank you for contributing! 🙏
