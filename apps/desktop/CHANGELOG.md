# Changelog — Raypx Desktop

## Unreleased

### Removed

- Remove the unavailable overview, Activity, Devices and local folder settings.
- Remove local Agent execution, device selection and the bundled Node/Pi runner.
- Remove inactive sync and notification preferences; existing saved themes remain
  available.

### Changed

- Rename product text, window and tray labels to Raypx, with the native identity
  `com.raypx.desktop` and a Raypx WebView profile. Existing native installations
  require signing in again; browser theme and language preferences migrate.
- Rename the application workspace to `desktop`.

- Replace the Tauri/Rust shell with Electrobun 2 and its pinned Bun native host.
- Preserve application icons, the 800px window minimum and close-to-tray controls.
- Persist theme, language and cloud session cookies in the new native WebView.

- Open directly in Projects; keep Projects and Settings in primary navigation.
- Settings now contains only the theme control. The titlebar still switches
  theme and language, collapses navigation and hides the window to the tray.
- Preserve cloud project creation, pagination, task management and account access.
- Keep shadcn Neutral themes, accessible controls and the Logo when collapsed.
- Keep explicit connection and account states, loading feedback and retry actions.

### Added

- English and Simplified Chinese translations with a language preference that
  survives application restarts.
- Native window and tray controls on macOS and Windows.

## Conventions

This changelog belongs to Desktop, the only surface with an installed version.
Entries describe changes users can observe. Group release entries under `Added`,
`Changed`, `Fixed`, `Removed` or `Security`, and rename `Unreleased` to
`<version> — <YYYY-MM-DD>` when a release is cut.

Keep the version in `package.json`, `electrobun.config.ts` synchronized. `0.1.0` is currently an unreleased placeholder;
there are no release tags or CI release jobs.
