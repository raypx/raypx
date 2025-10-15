# Repository Guidelines

## Project Structure & Module Organization
Raypx uses a Turborepo-driven pnpm workspace. Application code lives in `apps/web/src`, the TanStack Start frontend with route definitions under `apps/web/src/routes`. Shared domain packages (e.g., `packages/db`, `packages/trpc`, `packages/ui`, `packages/shared`) hold cross-application logic; each exports typed modules consumed by the web app. Tooling helpers live in `tooling/scripts`, while shared TypeScript configs sit in `tooling/tsconfig`. Public assets stay in `apps/web/public`, and tests sit next to their modules or inside `__tests__` folders.

## Build, Test, and Development Commands
`pnpm dev` runs `turbo dev` to start affected apps (use `pnpm web:dev` to focus on `apps/web`). `pnpm build` executes the Turborepo production pipeline. `pnpm typecheck`, `pnpm check`, and `pnpm format` wrap type checking, Biome linting, and formatting. Run `pnpm test` for unit tests and `pnpm coverage` to generate Vitest coverage reports. Use `pnpm clean` to remove build artifacts and `pnpm setup` when onboarding a new machine.

## Coding Style & Naming Conventions
Biome governs formatting: two-space indentation, 100-character lines, and required semicolons in TS/TSX. Prefer PascalCase for React components, camelCase for functions and variables, and SCREAMING_SNAKE_CASE for constants mirrored from environment variables. Route files follow TanStack naming (`apps/web/src/routes/(group)/$id.tsx`). Keep shared packages modular by exporting from an `index.ts` entry point.

## Testing Guidelines
Vitest is the primary unit test runner. Co-locate tests as `*.test.ts` or `*.test.tsx`; integration suites can live in `__tests__` directories. Ensure new features include coverage updates and run `pnpm coverage` before opening a PR. For UI changes, add screenshot references or story links when available; Playwright suites will be added later, so leave TODOs rather than unimplemented stubs.

## Commit & Pull Request Guidelines
Follow Conventional Commits enforced by Commitlint (`feat:`, `fix:`, `chore:` etc.); multi-scope work should use comma-separated scopes (`feat(web,db): ...`). Keep subject lines under 72 characters. Pre-commit hooks automatically run `pnpm -w format`, so make sure code is formatted. PRs should include a concise summary, testing checklist, linked issues (`Closes #123`), and relevant environment notes (e.g., new `.env` keys). Request review once `pnpm build`, `pnpm test`, and `pnpm check` pass locally.

## Security & Configuration Tips
Never commit `.env*` files; replicate secrets via `cp .env.example .env.local`. Database migrations run through `pnpm db:migrate`, and rollback helpers belong in `packages/db`. Review third-party keys before pushing and rotate shared credentials through the secrets manager referenced in internal docs.
