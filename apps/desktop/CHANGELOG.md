# Changelog — Raypx Desktop

## Unreleased

### Added

- Authorize local directories with the native picker, browse files, edit UTF-8 text, create folders, move entries and confirm permanent deletion.
- Create device-local Cron tasks for directory scans and noninteractive external commands, with time zones, upcoming executions and retained run history.
- Run interactive terminal sessions using the bundled standalone Raypx CLI.
- Recover a failed local engine through the retry control while account and settings remain available.
- Restore light, dark or system themes and English, Simplified Chinese or system language preferences from native device storage.

### Changed

- Rebuild the renderer as a TanStack Start SPA with Files, Automations, Terminal, Account and Settings navigation. The window layout appears in the user's theme before the renderer finishes loading.
- Bundle the exact matching CLI binary; users do not need a Node or Bun installation for local execution.
- Keep the window/tray shell and native WebView. Closing hides the window while local scheduling continues; Quit cancels managed execution and stops scheduling.
- Use a fresh account foundation for registration, verification, login and password recovery.

### Removed

- Remove the previous cloud project, task, AI and research product screens and their client dependencies.

## Conventions

Desktop owns the installed version. Keep `package.json` and `electrobun.config.ts` synchronized. Version `0.1.0` remains an unreleased placeholder. Rename `Unreleased` to the release version and date when a release is cut.
