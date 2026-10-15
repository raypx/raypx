# Foundation acceptance — 2026-10-15

This records checks actually run during the rebuild. Configured CI jobs are not
counted as executed platform results.

| Gate                            | Observed result                                                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Bun install              | Passed with the hoisted layout and repository lockfile                                                                                                      |
| `bun run verify`                | Passed: catalogs, architecture, formatting, lint, 15 check tasks, 120 tests, 19 build/check tasks and runtime probes                                        |
| New package acceptance          | Scaffold → install → policy → check passed without editing a central list                                                                                   |
| Turbo cache regression          | Repeat checks hit; upstream source edits invalidate consumers while unrelated packages stay cached                                                          |
| Node 24.15.0 artifact           | Complete output relocated outside the repository; health, static assets, deep navigation, 404s and unconfigured-mail rejection passed                       |
| Actual Node HTTP authentication | Relocated Node 24.15.0 server against fresh PostgreSQL: sign-in/cookie, account RPC, sign-out and revoked-cookie rejection passed                           |
| PostgreSQL authentication       | Fresh disposable PostgreSQL 15.18: verification, login, account RPC, password reset, prior-session revocation and logout passed                             |
| Chromium                        | Five Web/Desktop-renderer acceptance tests passed, including bilingual preferences and responsive forms                                                     |
| Expo                            | Type check, Doctor 21/21 and iOS/Android Hermes bundles passed                                                                                              |
| Standalone CLI                  | Empty-PATH execution outside the repository, persisted grants, NDJSON, real PTY and EOF process cancellation passed                                         |
| macOS arm64 native              | Packaged views:// renderer, file read, persisted task/scan, terminal, tray/window and full process restart passed; native preferences restored dark/Chinese |

Browser auth responses are controlled HTTP fixtures. The separate PostgreSQL test
exercises real Better Auth and oRPC. Temporary database clusters were stopped and
removed; no operator database or retired volume was used.

## Environment-dependent release gates

- PostgreSQL 17 is configured in CI; local authentication verification used 15.18.
- Windows native execution and macOS x64 packaging need their respective runners.
- Packaged macOS WebKit/Windows CEF account cookies still require the HTTPS
  sign-in → full restart → sign-out acceptance phases with synthetic credentials.
- Mobile native builds, signing/store submission and live Resend delivery were not
  performed. JavaScript bundles do not stand in for device authentication tests.
