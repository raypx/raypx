# Documentation index

Current implementation and verification commands are documented in the guides
below. `bun run policy` checks local links and requires every Markdown document
under `docs/` to be reachable from this index.

## Start here

- [Project overview and commands](../README.md)
- [Contributing](../CONTRIBUTING.md)
- [Architecture and package boundaries](../ARCHITECTURE.md)
- [Architecture guide and package references](ARCHITECTURE.md)
- [Environment configuration](../ENV.md)
- [Testing and verification](../TESTING.md)
- [Engineering scripts, policy, verify, and clean](../scripts/README.md)
- [Continuous integration](../.github/README.md)
- [AI development rules](../AGENTS.md)

## Foundations and engineering

- [Reusable foundations](FOUNDATIONS.md)
- [Doctor diagnostics](DOCTOR.md)
- [Independent consumer acceptance](CONSUMER_TESTING.md)
- [Vite and Vitest configuration](VITE_VITEST_CONFIG.md)
- [Dependency maintenance](VERSION_STRATEGY.md)
- [Bun catalogs](BUN_CATALOG.md)
- [Docker deployment guide](DOCKER.md)

Package interfaces and usage live in each package's README, linked from the
[architecture guide](ARCHITECTURE.md) and [foundations guide](FOUNDATIONS.md).

## Historical decisions and proposals

These documents preserve earlier reasoning or progress. They do not define
current commands or promise that proposed capabilities are implemented; consult
the current guides above for the supported behavior.

- [Scripts organization proposal](SCRIPTS_ORGANIZATION.md)
- [Scripts package discussion](SCRIPTS_PACKAGE_DECISION.md)
- [API architecture decision](API_ARCHITECTURE_DECISION.md)
- [CLI and worker architecture](CLI_WORKER_ARCHITECTURE.md)
- [Database enhancement proposal](DATABASE_ENHANCEMENT_PLAN.md)
- [Hono integration proposal](HONO_INTEGRATION.md)
- [JSDoc progress record](JSDOC_PROGRESS.md)
