# MyGo Desktop build and release

See [Desktop commands](../../apps/desktop/README.md) and [ADR 0038](../architecture/0038-mygo-desktop-host.md).

Bun 1.4.4 owns renderer and compiled CLI builds. Go 1.27.3 owns the MyGo v0.7.3 host,
built with CGO_ENABLED=0. `bun run package:desktop` stages frontend/manifests,
version-matched standalone CLI and the complete Herdr runtime, then invokes the
pinned MyGo packager. Outputs live under `apps/desktop/build/<os>-<arch>`.
No separately installed Bun or Node is needed at runtime.

MyGo v0.7.2 and later disable page pinch zoom and swipe navigation by default.
Desktop keeps these defaults; enable `PageOptions.PinchZoom` or
`PageOptions.SwipeNavigation` explicitly if a future page needs those gestures.

Production MyGo builds omit the native UI inspector. After packaging run
`bun apps/desktop/scripts/native/check-release.ts`: it checks the actual host's
Go module/build metadata and rejects embedded native-smoke controls or renderer
hooks. The headless `mygo:smoke` checks the embedded frontend and matching CLI;
it does not validate a running WebView.

Normal CI checks Go policy/transport and compiled Herdr. Distribution is selected
only for a tag or explicit `distribution` request. Packaging and installed native
GUI smoke run separately on macOS and Windows. Smoke uses a separate identity,
Go build tag, renderer output and temporary profile; Windows hosted runners verify
real per-user NSIS install/uninstall and payload hashes. Quiet local smoke never
activates a window. Interactive smoke belongs on isolated CI.

macOS signing uses APPLE_SIGNING_IDENTITY and a temporary imported keychain.
When complete Apple credentials are available, CI creates RAYPX_NOTARY_PROFILE
for MyGo notarization and verifies the stapled result. Windows CI imports the PFX
and passes its thumbprint to MyGo's signtool command. Missing credentials produce
unsigned/ad-hoc packages and are reported as such.

Signed MyGo updates require MYGO_UPDATER_PRIVATE_KEY,
RAYPX_MYGO_UPDATER_PUBLIC_KEY and an HTTPS RAYPX_MYGO_UPDATER_URL. MyGo generates
its own update archives/manifests. Do not point it at a Tauri update manifest or
reuse that protocol's signing settings.

Before a public release, verify installed-app upgrade, OS key storage/session
migration, server-isolated WebView storage, sleep/wake reconnect, daemon task
survival after GUI Quit, real account/provider flows, and distribution signatures.
Local headless results do not count as platform GUI or signing acceptance.

The pinned packager uses a small local packager adapter owned by
apps/desktop/scripts/native/packager.ts. It refreshes Herdr's checksums after native
helper signing and before the enclosing app/installer/update archive is sealed.
The downloaded inputs are verified first; runtime never rewrites the manifest.
The Go module cache is untouched. Changes to MyGo's signing boundaries fail closed
until this adapter is reviewed. The pinned CLI sources are copied into the ignored .mygo/packager directory.
Remove the adapter when upstream provides this hook.
