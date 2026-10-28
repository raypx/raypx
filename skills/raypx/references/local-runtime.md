# Local runtime (CLI)

App: `apps/cli` ([AGENTS](../../../apps/cli/AGENTS.md)). Standalone Bun-compiled binary;
works without login, Node or a global Bun.

- Commands: `raypx files` (authorized directories), `raypx jobs` (Cron automations),
  `raypx tools` (external commands), `raypx tui`; `--json` for machine output.
- Device-local SQLite profiles (`--profile`, `--data-dir`) survive logout.
- File grants constrain built-in file operations (no traversal or symlinks); external
  commands keep normal OS permissions. Deletes require confirmation.
- Only the Desktop-owned stdio engine schedules Cron jobs; missed triggers are skipped.
- Terminals, Agents and external commands get `bun`/`bunx` at the end of PATH, backed by
  the CLI's embedded Bun (`BUN_BE_BUN=1`); an installed Bun keeps precedence.
- Build with `bun run build:cli`; Desktop launches the version-matched binary by
  absolute path and never imports CLI source.
