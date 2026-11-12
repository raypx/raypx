# @raypx/tooling

## Purpose

Application build and acceptance helpers imported by API, Web, Desktop, CLI, E2E,
Railway and Dev CLI. Task registration belongs to `@raypx/task-graph`; every
`raypx-dev` command belongs to `@raypx/dev-cli`.

## Interface

| Entry                                                                           | Consumers                           |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| `./build/nitro`, `./build/deployment`, `./build/analytics`, `./build/start-env` | API, Web, Desktop, Railway, Dev CLI |
| `./build/cli`, `./build/release`                                                | CLI and Desktop packaging, Dev CLI  |
| `./browser-server`                                                              | E2E, Desktop performance            |
| `./performance`                                                                 | CLI and Desktop performance runs    |

- `./build/nitro` supplies shared Nitro Bun build options to API and Web configs.
- `./build/deployment` owns service ports, health paths and API ingress routes.
  Policy checks static Docker, Compose and Caddy adapters plus API environment
  forwarding without importing application runtime or loading environment files.
- `./build/start-env` keeps Start's dotenv behavior without reporting every inherited
  CI/tool variable as a build dependency; callers inject Vite's `loadEnv`.
  `./browser-server` serves only compiled Desktop client assets on loopback with
  HTML deep-link fallback; never run Vite configuration or simulate backend/Native IPC there.

`./performance` validates prepared artifacts, scrubs credentials, preserves Strobe ownership, and exports check/A/A/A/B evidence. Performance leaves are uncached and have no CLI build prerequisite. Missing process attribution is uncertain, never a passing measurement.

## Constraints

No product runtime imports this package. Do not import Dev CLI or Task Graph source.
Every entry keeps a consumer in another workspace.

## Verification

Run `bun run --cwd packages/tooling test` and `check`, then `bun run policy`.
