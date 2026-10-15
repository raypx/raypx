# Feature reduction and Electrobun acceptance

Historical first-batch results before [Admin retirement](../architecture/decisions/0021-retire-admin.md).

Verified locally on October 12, 2026, on macOS ARM64 with Bun 1.4.0,
Node 24.18.0 and PostgreSQL 17.11. Product boundaries are recorded in
[ADR-0019](../architecture/decisions/0019-retire-legacy-desktop-execution.md);
the native host is defined by
[ADR-0020](../architecture/decisions/0020-electrobun-desktop-host.md).

## Verified results

| Gate                                       | Result                                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Bun installation                    | Passed                                                                                                                                |
| Affected workspace checks and narrow tests | Passed, including Desktop 41 tests and Admin 18 tests                                                                                 |
| `bun run verify`                           | Passed: catalogs, policy, format, lint, checks, all Vitest layers, builds and Worker/Web/API runtime probes                           |
| PostgreSQL integration                     | 27 tests passed against a dedicated disposable test database                                                                          |
| Browser E2E                                | 42 tests passed, including cloud facts, account isolation, projects/tasks, Admin individual writes, Desktop layouts, theme and locale |
| Drizzle generation                         | No schema changes or new migration                                                                                                    |
| Desktop native types                       | Renderer, config and native checks passed                                                                                             |
| macOS native packaging                     | Root Turbo build and Electrobun stable DMG passed                                                                                     |

The full gate ran in an isolated managed checkout containing this task's source
changes. Concurrent compiler output in the original checkout was preserved.
The final source snapshot matched the original task files. Database and browser
suites used separate synthetic fixture databases; no operator database or
user-local journal, session or file was cleaned.

The root lint task prepares the uncached Electrobun devkit and declaration
projection before checking source. Preparation was exercised with an empty
project SDK cache. Generated package compiler output is excluded from lint and
format; its owning source remains checked.

## Native evidence

The packaged `views://main` shell loaded actual SPA assets and native runtime
metadata. Real window checks passed for renderer-requested hiding,
close-to-tray, restore, minimum dimensions and persistent WebView resizing.
The stable package retains the ordinary application identity and contains its
pinned Bun host, without the retired Node/Pi runner resources.

Two independent native processes used a static loopback HTTP preview and a real
test API. The first signed in with synthetic credentials, loaded authorized
projects, changed theme/language and immediately used the production tray quit
handler. The second retained the cookie, Chinese locale and light theme, and
read the account/projects successfully without another sign-in. No reload or
development hot update was used to make persistence pass. Native smoke has its
own application identity and persistent partition.

## Remaining environment gates

- Actual Windows packaging/runtime and CEF negative CORS checks require the
  Windows runner. Source enforces packaged CEF resources and prevents the known
  unsafe WebView2 fallback; this is not a Windows execution result.
- Packaged `views:` authentication requires a real HTTPS API with the exact
  allowed origin and production `SameSite=None; Secure` cookies. Loopback HTTP
  persistence does not establish that WebView compatibility.
- Native smoke covered tray shutdown; the no-tray close policy has unit coverage.
  OS menu quit and external signals retain the SDK graceful shutdown path and
  were not separately exercised.
- Remote CI and the Worker Docker/document-export gate were not run locally;
  Docker was unavailable. Existing CI retains PostgreSQL 17, browser, generated
  output and macOS/Windows packaging jobs.

The local native installer is a validation artifact built against the synthetic
loopback API. Build a distribution artifact with its intended HTTPS API origin.
