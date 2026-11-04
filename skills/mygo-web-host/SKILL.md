---
name: mygo-web-host
description: Maintain MyGo desktop hosts that embed a web frontend. Use for Go window/page lifecycle, trusted renderer IPC, custom protocols, packaging and MyGo upgrades; React-only changes do not need this skill.
---

# MyGo web hosts

Read the host workspace's instructions first. For Raypx, start with
[Desktop ownership](../../apps/desktop/AGENTS.md) and the
[host decision](../../docs/architecture/0038-mygo-desktop-host.md).
Preserve the application's existing web frontend and bridge contract.

## Work against the pinned framework

From the app's Go module, locate the installed source:

```sh
go list -m -f '{{.Version}} {{.Dir}}' github.com/egoist/mygo
```

Read only the relevant files beneath that directory. Check the implementation
when an API's cancellation, ordering or platform behavior affects the change.

| Change                                                         | Framework references                          |
| -------------------------------------------------------------- | --------------------------------------------- |
| Window creation, visibility, restoration and close             | `docs/app.md`, `docs/windows.md`, `window.go` |
| Preload, caller identity, concurrent methods and page lifetime | `docs/bindings.md`, `page.go`                 |
| Embedded assets, custom schemes and trusted origins            | `docs/frontend.md`, `docs/configuration.md`   |
| Build resources, signing and signed update manifests           | `docs/distribution.md`, `docs/updates.md`     |

Bound methods may run concurrently. Carry caller cancellation into page-owned
work, and guard shared state. Keep work that must not run during binding
generation in the ready lifecycle: generation executes the app up to `App.Run`.
Use the application's established generation/build commands rather than editing
generated bindings or introducing a parallel client.

For new windows, trace the actual calling page, allowed origin, subscriptions and
cleanup separately for each window. Framework support for a window does not grant
it the application's existing main-window privileges. Distinguish hiding, closing
a window and quitting the GUI from independent background execution.

Treat an upgrade between `0.x` minor versions as an API review. Compare the
old/new source and affected documentation before changing the pinned module;
native UI migration tools apply only if the application imports MyGo's `ui` package.

## Verify the changed layer

Run focused Go policy/transport tests for host changes and the workspace's
renderer checks for bridge changes. Browser E2E establishes compiled web behavior;
native IPC and WebView persistence need the separate native gates. Follow workspace
rules for quiet local checks and platform acceptance, and report unrun platforms.
