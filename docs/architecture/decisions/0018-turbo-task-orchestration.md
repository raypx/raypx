# ADR-0018: Turbo task orchestration with Vite+ leaf tools

## Status

Accepted

Supersedes [ADR-0002](0002-vite-plus-sole-orchestrator.md).

## Context

The cloud Web, API and Worker now need reusable local and remote task results,
explicit source-export dependency hashes, and independently pruned deployments.
Bun remains the package manager and Node 24.18.0 remains the production runtime.

## Decision

Turbo is the only workspace task runner and task cache. Vite+ remains the leaf
implementation of dev, build, test, lint, fmt, pack, staged files and hooks.
Keep the Vite configs, independent Vitest configs and `vite-plus/test` imports.
Do not add another linter, formatter, test runner or hook manager.

Root scripts enter `vmx tasks`, which supplies a platform fingerprint and strict
cache trust policy, then invokes the repository-local Turbo. `turbo.json` owns
ordering, inputs, outputs and caching. Do not invoke the Vite+ task runner or
configure its task cache. The CLI does not implement a competing task graph.
Procedural database, policy and maintenance commands still call `vmx` directly.

Build depends on check and dependency builds. Transit nodes carry source-export
package hashes to consumers even when those packages emit no JS. Shared owns the
only library pack build and is built before consumer checks and tests. Leaf
build scripts do not embed duplicate checks; shipping builds use root scripts.

Deterministic checks, pure unit/component tests, lint and format checks are
cacheable. Integration, PostgreSQL, E2E, providers, runtime probes, generation,
migrations, document acceptance and deployment are uncached. `verify` preserves
ordered gates and executes the Node artifact probes directly every time.

Remote caching uses Vercel with HMAC signatures. Local runs require all three
credential variables; otherwise only local cache is used. CI grants remote
credentials only to trusted canary push/manual runs. Pull requests receive none
and use fresh local caches. Signing protects integrity, not confidentiality:
never cache credentials, sessions, user documents, or signed URLs.

Docker uses the pinned Turbo catalog version to prune the application closure.
Keep the canonical Bun lockfile and install the pruned workspace manifest
frozen: Turbo 2.11.7 drops optional-peer development resolutions needed by shared
pack from its pruned Bun lock. Bun 1.4 skips excluded workspaces while preserving
exact package resolutions. Delay root postinstall until sources are copied, then
build through the same task graph. Validate this path with clean
installations and final Node/container probes rather than assuming compatibility.

## Consequences

- Bun catalogs and the lockfile remain authoritative; production does not use Bun.
- Cache identity includes OS, architecture, actual Node/Bun versions and libc.
- Vite build environment variables are explicitly fingerprinted by Turbo.
- Native/SDK resources and generated output restoration need real acceptance.
- Formatter exclusions and the opt-in staged-file hook remain unchanged.
- Revisit task boundaries using measured cache hit rates and CI duration.

## Follow-up

Revisit task boundaries when measured cache hit rates, CI duration or a new
production host expose a missing input, output or execution boundary.
