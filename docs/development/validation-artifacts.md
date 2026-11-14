# Validation scripts and generated evidence

Reusable automation lives in `packages/dev-cli/src/validation/`. `.artifacts/`
contains generated evidence only. Turbo owns the sole task/cache graph; leaf
scripts never re-enter it. `raypx-dev` discovers workspaces from root manifests.

`bun run verify` selects affected source checks/tests and host checks for native
inputs. `--full` runs repository-wide audits, builds and current-platform artifact
probes. PostgreSQL, browser, Engine, live model and packaged native gates stay
explicit. See [testing](testing.md) for commands and limits.

`bun run test backends --with-e2e --database-url <disposable-test-url> -- --workers=1`
records API PostgreSQL/Redis results, owned service logs and browser JSON in one
evidence directory. Its explicit database mode never starts or drops another
database. The browser fixture is test-only and is never shipped in production.

Native CI compiles one production CLI payload, signs/seals it, archives it and
passes its immutable inventory to consumers. Format 2 includes the executable,
metadata and legal files. Consumers verify identity and never build implicitly.
The native checks run process runners, installed CLI smoke and Go checks. Separate
distribution jobs cover package/signature/interactive acceptance. Local tests use
private homes and owned processes; unrun platforms remain unverified.

Build-size reports describe current CLI/Desktop components. Cache keys include
source prerequisites, relevant environment and platform identity. Tests and docs
are excluded from dependency transit hashes; their own tasks still hash their
inputs. `bun run policy` validates public-entry consumers, dependency cycles,
runtime/tooling boundaries, pins, catalogs and documentation links.

`bun run unused` and repository audit tasks inspect the current manifest graph;
removed workspaces/public entries must disappear from both consumers and tooling.
`bun run clean:artifacts` removes generated evidence/test reports while preserving
builds and user data. Never store authored automation under `.artifacts/`.

Artifact probes use the explicit disposable TEST_DATABASE_URL when supplied to
exercise relocated API routes and readiness. Without it, the API probe requires
the sanitized startup refusal caused by unavailable PostgreSQL; it does not claim
healthy API acceptance. Relay probes retain an unavailable broker check.
