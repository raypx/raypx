# ADR-0020: Electrobun Desktop host

## Status

Accepted, October 12, 2026. Replaces the native-host and packaging details in
[ADR-0019](0019-retire-legacy-desktop-execution.md); its product scope and
retirement boundaries remain unchanged.

## Context

The user chose Electrobun after comparing it with Tauri v2. Desktop is now a
lightweight cloud project client, so the native host needs only window/tray
behavior and a small renderer bridge. Keeping those concerns in TypeScript
removes the Rust workspace and its separate build toolchain.

## Decision

- Pin Electrobun 2.0.2 in the root Bun frontend catalog. Its npm bootstrap pins
  the matching Hutch/devkit; `hutch.config.ts` records the exact Electrobun
  version and uses Bun package management. Hutch is used only as Electrobun's
  native build tool, never as the monorepo package manager or task runner.
- Keep Bun 1.4.0, Turbo and Vite+ in their existing roles. Select Electrobun's
  Bun main process; the pinned SDK supplies Bun 1.4.0. Server applications
  continue to run on Node 24.18.0.
- Keep TanStack Start SPA routing and the React renderer. Vite+ builds
  `dist/client`; Electrobun copies that output into its private `views://`
  assets. Prepare the generated `.hutch/devkit` before Desktop checks/builds;
  use its explicit main/view/config aliases instead of importing the npm shim.
- `apps/desktop/native` owns TypeScript window/tray lifecycle and typed RPC.
  The renderer may request runtime information and window actions only; cloud
  account/project behavior still uses `@raypx/client`. No model, local tool,
  device execution, credential storage or filesystem API is exposed by RPC.
- macOS uses the native WebKit renderer. Windows bundles CEF and explicitly
  disables the framework's `disable-web-security` flag; the native WebView2
  wrapper hardcodes that unsafe flag without a supported override in 2.0.2.
  Windows packaging therefore accepts the additional Chromium size and requires
  native CORS-negative validation before release.
- Preserve the application identifier, version, original colored icons, window
  size boundary, theme/language, close-to-tray behavior and show/hide/quit menu.
  Use a persistent native WebView partition for preferences and session cookies.
  Do not migrate user data or revive the former Pi runner.
- `desktop:build` enters the root Turbo renderer gate before the Electrobun
  stable build. Build macOS and Windows packages on their native CI runners.
  Native SDK preparation and packaging remain outside task-cache reuse.

## Consequences

Rust/Cargo and Tauri are no longer repository prerequisites or dependencies.
Desktop packages include the Electrobun native host and its pinned Bun runtime;
the retired Node/Pi execution resources remain absent. The framework's generated
SDK is local build input and must not be committed or hand-edited.

Native asset navigation uses hash history and client-only route composition;
Start still prerenders the static document shell. Browser-preview tests establish
renderer behavior. Native launch, persistent
WebView state, minimum sizing, typed IPC and tray lifecycle require separate
checks. Old Tauri/browser profiles do not share Electrobun's cookie partition.
There are no published Desktop clients requiring a profile migration.

## Follow-up

Revisit the native runtime only when a verified product requirement justifies
another engine, native capability or distribution mechanism.
