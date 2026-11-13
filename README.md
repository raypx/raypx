# Raypx

The home for persistent Agents, each with one continuing conversation. Sign in to
Web or Desktop, choose a Space, create an Agent and follow its streamed replies.
Spaces are the authorization boundary; PostgreSQL is the one authority.

Phase 1 provides conversation and process-local backend replies with queued Runs
and stop. It has no tools or crash recovery. Durable Runs, computers, approvals,
routines, Agent/Space memory and shared Spaces arrive in later phases. The earlier
CLI/daemon and native device runtime remain in the repository during that
transition; they do not own the new conversations. See the
[architecture](docs/architecture/README.md), [roadmap](docs/roadmap.md) and
[product](PRODUCT.md).

## Requirements

Bun 1.4.4 and a new isolated PostgreSQL database for accounts and conversations.
Bun is the only JavaScript runtime; `packageManager` pins it. With
[mise](https://mise.jdx.dev), run `mise trust && mise install` once; direct installs
also work. `bun run doctor` confirms the environment.

Native Desktop development and packaging require Go 1.27.3 and MyGo 0.8.3, with
`CGO_ENABLED=0`. The configured macOS minimum is 13.5; Windows uses WebView2.
Linux CLI support does not establish Linux Desktop acceptance. Desktop bundles the
compiled Bun CLI/daemon; users do not install Bun. See the
[Desktop guide](docs/development/desktop.md#build-and-release).

```sh
bun install
cp .env.example .env
# Starts a NEW database on 5433; does not reuse the old volume.
docker compose up -d postgres
bun db:migrate
bun dev
```

Web (TanStack Start SSR) runs on 3000; the combined backend runs on 3002. They
remain separate Bun services: `bun apps/web/.output/server/index.mjs` and
`bun apps/api/.output/server/index.mjs`. Web bakes `VITE_API_URL` at build time.
For server-rendered sign-in, serve both from one origin or set `AUTH_DOMAIN` to
the parent domain of sibling hosts such as app/api.example.com. Configure offered
models and credentials as described in the
[phase 1 reply guide](docs/architecture/execution.md#deployment-model-configuration).
An empty catalog leaves model replies unavailable rather than inventing a model.

The current backend still defaults to `SERVER_ROLE=both`; split `api` and `relay`
roles use the same output and a private Redis broker. This differs from the target
worker topology. Phase 1 live replies require one API-enabled process.

Agents is the signed-in destination. Account/security, administration,
configuration, device preferences and the earlier standalone Memory views remain.
Project/session pages, Waiting, New session and the guest editor are removed.
Conversation use requires a reachable server; local drafts are not offline
execution. Desktop retains system-browser sign-in and its native transport. The
CLI still supports the earlier registered device workflows, as documented in the
[development guides](docs/development/getting-started.md); it becomes a device
connector in a later phase. No profile import or migration is provided.

## Daily commands

| Task              | Command                                |
| ----------------- | -------------------------------------- |
| Start Web and API | `bun dev`                              |
| Start Desktop     | `bun dev:desktop`                      |
| Test a workspace  | `bun run test --package @raypx/agents` |
| Run browser E2E   | `bun e2e`                              |
| Verify changes    | `bun verify`                           |
| Check formatting  | `bun format`                           |
| Apply formatting  | `bun format --write`                   |
| Build             | `bun run build`                        |

Turbo schedules and caches scripts declared in workspace manifests. Engineering
commands are exposed as `raypx-dev`; the product executable is `raypx`. Workspace
discovery reads root `package.json` patterns, including applications, libraries,
infrastructure and E2E. `verify` selects affected source checks/tests;
`verify --full` adds repository-wide audits, builds and current-platform artifact
probes. PostgreSQL, browser, live model and packaged GUI acceptance are separate
gates. An unrun platform is never a pass. Mobile currently provides an account and
sign-in baseline, not the full Agent client.

Use `bun run test --help` or the
[test command guide](docs/development/testing.md#test-commands) for suites and
optional gates. See [documentation](docs/README.md),
[workspace boundaries](docs/development/workspaces.md) and
[verification](docs/development/testing.md).
