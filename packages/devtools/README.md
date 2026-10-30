# @raypx/devtools

Private, development-only page diagnostics for Raypx Web and Desktop. The official
Vite DevTools Dock opens a shared React panel inside the application's existing
providers. Production builds eliminate the client import and never enable the
Vite plugin. This workspace is not published to npm.

## Entries

- The root exports `DevtoolsBridge` and `PageDiagnosticsSnapshot`. Mount the bridge
  under Router, Query, language and theme providers with `surface` and the existing
  application stylesheet URL. Lazy-load it only under `import.meta.env.DEV`, after hydration.
- `/vite` exports `raypxDevtools()`. Also set `devtools: { apply: "serve",
  embeddedVisibility: "passive" }` directly in the application's Vite configuration.
- `/renderer` supplies the official custom-render Dock lifecycle. Its module-local
  target is shared with the bridge; excluding this workspace from dependency
  prebundling keeps one ESM instance in each page.
- `/snapshot` exports the pure metadata projection and its types.
- `/styles.css` registers the component directory with the application's Tailwind build.

Snapshots contain route templates/status and field names, current preferences,
and anonymous Query metadata. Query keys, hashes, response/loader data, complete
URLs and exceptions are never serialized. Data remains in the current page;
there are no diagnostic server endpoints or cross-tab broadcasts.

See the [development guide](../../docs/development/devtools.md) for usage and verification.
