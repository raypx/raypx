# Vite and Vitest Configuration

Raypx uses Vite+ for configuration, tasks, and Vitest. Keep ordinary package
build/test settings together; use a separate test configuration when the runtime
or artifact prerequisites differ.

| Configuration                         | Responsibility                                                      |
| ------------------------------------- | ------------------------------------------------------------------- |
| Root `vite.config.ts`                 | Formatting, lint, and staged checks                                 |
| Root `vitest.config.mts`              | Discovers workspace/script projects and owns coverage               |
| `packages/*/vite.config.ts`           | Source unit tests and package tasks through `@raypx/config/vite`    |
| `apps/web/vite.config.ts`             | Start/Nitro development and build, plus the `web-unit` test project |
| `apps/web/vite.integration.config.ts` | `web-integration`: real built Bun service and HTTP acceptance       |
| `packages/ui/vitest.config.ts`        | Opt-in Chromium Storybook interaction and accessibility tests       |
| `scripts/vite.config.ts`              | Node tests for repository tooling and its subprocess behavior       |

Root `vp test` commands automatically prefer `vitest.config.mts` over
`vite.config.ts`; no explicit `--config` is needed. Package tasks keep their own
configuration, and Storybook remains an explicit opt-in configuration.

The web unit project disables application build plugins in test mode and uses a
minimal route-tree fixture for the real router/query-client isolation test. It
does not generate routes, build Nitro, or start the application. Production
integration tests live in `apps/web/test/integration/` and require existing build
artifacts. The web integration task declares that build dependency; the existing
aggregate test task still runs both projects. Application Playwright and
independent consumer browser suites remain separate acceptance commands.

```sh
bun run test:unit
bun run test:watch
bun run test:integration
bun run vp test run --project web-unit
bun run storybook:test
bun run test:scripts
```

Use `defineConfig` from `vite-plus` and test APIs from `vite-plus/test`.
`bun run test` invokes Raypx's task orchestration; `bun test` invokes another
runner and is not the acceptance command. Shared source aliases accelerate unit
tests, while independent consumer acceptance deliberately resolves copied public
artifacts without those aliases.

TypeScript presets remain static JSON exports from `@raypx/config/tsconfig/*`.
The package `tsconfig.test.json` files validate source, test, and configuration
types; they do not configure the Vitest runtime. Web checks both its normal and
E2E TypeScript configurations, including the shared test-service helper.

See [TESTING.md](../TESTING.md) for prerequisites, service cleanup, CI coverage,
and acceptance commands, and [the config package](../packages/config/README.md)
for task/cache/source-alias ownership. These actual configurations are the source
of truth; adding another runner or splitting every package config is unnecessary.
