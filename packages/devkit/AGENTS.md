# @raypx/devkit

## Purpose

Generic repository mechanics shared by Tooling, the TypeScript presets and
runtime-node: workspace discovery and boundaries, static catalogs, document
links, relocated artifacts, Git change scopes and VP task helpers. Raypx-specific
policy, commands and probes stay in Tooling.

## Interface

| Path             | Purpose                                                  |
| ---------------- | -------------------------------------------------------- |
| `./workspaces`   | Discovery, metadata, export and import resolution        |
| `./architecture` | Workspace boundary checks over static imports            |
| `./process`      | Inherited-output commands and the dotenv environment     |
| `./artifact`     | Relocated output staging and Node server probes          |
| `./catalogs`     | Static message catalog reader                            |
| `./docs`         | Relative Markdown link check                             |
| `./tasks`        | Task discovery, graph validation, VP launch and leaf run |
| `./verification` | Git changes and reverse scope propagation                |
| `./vite`         | Injected Start environment loading                       |

## Constraints

- Bottom of the workspace graph: no internal dependencies. Tooling, the TypeScript
  presets and runtime-node depend on it, so the tsconfig inlines the strict preset
  and `vite.config.ts` registers tasks through `scripts/task.ts`.
- Callers supply policy as plain data; never discover, import or execute repository
  configuration or inspected sources. Parse sources and catalogs with oxc-parser.
- `developmentEnvironment` layers `.env.local` then `.env` beneath the process
  environment with `node:util` `parseEnv`: values are literal and never printed.
- Keep entries independent so each loads only its own dependencies; a heavy
  dependency in `process` or `tasks` slows every VP configuration load.
- Keep findings as stable `path: message` strings; consumers and tests match them.

## Verification

```bash
bun run --cwd packages/devkit check
bun run --cwd packages/devkit test
```
