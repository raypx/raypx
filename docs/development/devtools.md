# Page DevTools

Web and Desktop development servers expose the official Vite DevTools Dock with
a Raypx page diagnostics panel. Start either application normally, press
**Shift + Alt + D** (Shift + Option + D on macOS), then select **Raypx**. The official
client authorization flow remains enabled in normal development.

The panel follows the current page's language and theme and provides two views:

- **Page state**: application surface, route status/loading, matched route templates,
  parameter/search field names, and resolved language/theme plus their preferences.
- **Query cache**: anonymous query IDs, allowlisted static labels, status,
  fetch status, invalidation/staleness, observers and last data update time.

Only queries already in the page's QueryClient are inspected. Opening the panel
does not fetch private data, invalidate queries or invoke native operations.
The panel pauses rendering while its Dock entry is inactive. No diagnostic data
is sent to a server or another browser tab.

## Copying a snapshot

**Copy diagnostic snapshot** takes a fresh snapshot, formats versioned JSON and
uses the browser Clipboard API. If the API is missing or permission is denied,
the panel shows a selected, read-only JSON field for manual copying. No native
clipboard method or Go changes are required. A failed copy never reports success.

The snapshot deliberately excludes complete URLs, parameter/search values,
query keys and hashes, returned data, loader results and exception messages or
stacks. Query hashes contain serialized keys and are not safe identifiers. Query
IDs are page-local aliases; unknown query namespaces use their anonymous alias.
Task bodies, files, transport traffic and native engine state are outside v1.

## Integration

`@raypx/devtools` is a private shared workspace. The application's Vite config
enables DevTools only for `serve` and registers its custom renderer. The application
lazily mounts `DevtoolsBridge` inside existing Router, Query and preference providers
after hydration. This also loads the embedded client when Start's HTML pipeline
bypasses Vite's automatic injection. An isolated shadow root loads the same app
stylesheet and hosts a React portal, preserving providers and containing styles.

The bridge and renderer share page-local ESM state. Unmount, StrictMode and HMR
must not duplicate scripts or subscriptions. Production builds remove the guarded
import and do not enable the plugin or a diagnostics endpoint. Vite+/Bun remain the
existing toolchain; no additional task runner or published package is introduced.

## Verification

```sh
bun run --cwd packages/devtools test
bun run --cwd packages/devtools check
bun run --cwd e2e e2e:devtools
bun run verify
```

The explicit `e2e:devtools` suite starts test-owned loopback development servers on
ports 4300 and 4301, with a synthetic API origin. Only these test servers disable
DevTools client authorization to allow an isolated headless browser. They never
use an operator account. The normal compiled-artifact E2E gate remains separate
and asserts that development diagnostics are absent.

Desktop renderer browser tests do not establish native WKWebView/WebView2 evidence.
Check the Dock and clipboard/manual fallback in an isolated MyGo development window
on each claimed native platform. Report unavailable native checks explicitly.
