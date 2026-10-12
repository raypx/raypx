# Changelog — Voidmix Desktop

## Unreleased

- Compact refresh and pagination controls; move setting explanations into accessible help popovers and group unavailable notices.
- Replace titlebar theme, language and hide-to-tray text with compact icon buttons and accessible labels.
- Use shadcn Neutral light and dark themes, consistent controls and neutral status badges.
- Keep the Logo visible when navigation is collapsed.
- Keep navigation selection synchronized with the current route.

- Unify project lists and task details with the Web workbench.
- Add collapsible navigation and support 800px native windows.
- Show explicit unavailable states instead of demo snapshots and fixed activity.
- Mark runtime-unwired preferences unavailable while preserving saved values.
- Improve typography, theme contrast, keyboard focus and settings feedback.
- Add project pagination with URL-backed navigation and route cancellation.

This file exists for `apps/desktop` alone, because it is the only surface with a
version users see: a Tauri bundle they install and later upgrade. Web (including
Admin routes) and API are continuously deployed from `canary` and have no release to describe, so
they have no changelog — git history already records their changes.

Entries describe what changed **for someone running the application**. Internal
refactors, dependency bumps, and tooling changes belong in the commit log unless a
user can observe them.

## Conventions

- Newest release first. Heading format `## <version> — <YYYY-MM-DD>`.
- Group entries under `Added`, `Changed`, `Fixed`, `Removed`, or `Security`; omit
  the groups that have nothing in them.
- Keep unreleased work under `## Unreleased

- Use shadcn Neutral light and dark themes, consistent controls and neutral status badges.
- Keep the Logo visible when navigation is collapsed.` and rename that heading when a
  release is cut.
- The version must match `package.json`, `src-tauri/tauri.conf.json`, and
  `src-tauri/Cargo.toml`, which are currently kept in step by hand.

## Unreleased

- Use shadcn Neutral light and dark themes, consistent controls and neutral status badges.
- Keep the Logo visible when navigation is collapsed.

### Added

- English and Simplified Chinese shell translations with a no-refresh language
  switcher that remembers the selected locale.
- Projects, project detail, and Library destinations with responsive preview
  cards, task progress, deadlines, and asset search entry points.

### Changed

- Settings toggles now use the shared accessible UI control, and project, device,
  activity, and overview actions use the shared button styles consistently.
- Theme, sync pause, and settings preferences now survive navigation and
  application restarts. Existing saved theme choices are preserved.
- Page navigation now loads data through TanStack Start routes, with loading
  feedback and retry controls. Creating a project refreshes the project list.
- Activity filters are preserved when refreshing or using back and forward.
- Renamed the desktop application from Voidmix Cloud/Voidmix Field to VoidMix.
- Primary navigation now follows Home, Projects, Library, Activity, and Settings;
  Devices is managed from Settings.
- Projects and Library now load through the typed cloud API when configured, with
  explicit Preview data and unavailable states when live data is unavailable.

`0.1.0` has not been released; there are no tags and CI has no release job, so
the version in the three manifests is a placeholder rather than a shipped build.

### Fixed

- Choosing a folder in Settings now sends the expected native authorization
  payload and displays the authorized directory.

- The titlebar and settings theme controls now stay synchronized. Switching
  language no longer resets settings toggles.
- Opening a project now displays its detail page instead of leaving the list
  visible. Missing projects show a dedicated message and a link back.
- Rapidly switching projects cancels obsolete requests and keeps the latest
  project's data visible.
