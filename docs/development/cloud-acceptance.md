# Cloud release acceptance

Implementation boundaries are recorded in [the cloud platform](../architecture/cloud-platform.md)
and [ADR-0016](../architecture/decisions/0016-cloud-agent-platform.md), refined by
[ADR-0017](../architecture/decisions/0017-gateway-and-task-rounds.md) and
[ADR-0018](../architecture/decisions/0018-turbo-task-orchestration.md).

## Architecture rebuild verification, 8 October 2026

`bun run verify` passed on Bun 1.4.0 and Node 24.18.0 after the final route fixes:
policy, format, lint, types, unit/component/integration tests, builds, isolated
Worker startup and Web/API HTTP probes, including the Gateway authorization check.

| Check                                           | Result                                                                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dedicated PostgreSQL 17.11 database             | 27 tests passed, including TaskRound acceptance races, shared owner-account budgets, grant expiry/revocation, fencing and durable message projections              |
| Real browser suite against PostgreSQL 17.11     | 42 tests passed, including real login, session revocation, SSR/account isolation, Task review, responsive Web and Desktop layouts                                  |
| Isolated API artifact on Node 24.18.0           | Fresh PG17 baseline, real Better Auth sign-in, model catalog readiness and typed durable-grant bootstrap passed; no live model request was made                    |
| Signed filesystem transfers in the API artifact | Upload, completion and download passed with matching actual bytes/checksum and private, no-store caching                                                           |
| Per-Run Runner and Gateway tests                | Separate Node child environment, duplicate claims, process failure, real Pi using an injected Gateway stream, once-only model dispatch and usage settlement passed |
| Compiled document exports                       | Actual Chinese PDF, XLSX/CSV and eight-page PPTX with real PDF conversion passed using local fonts and converters                                                  |
| Pruned Worker and local Turbo cache             | Frozen installs for API/Web/Worker passed; 14 Worker tasks restored cached output, including Runner/Pi assets, which started on Node 24.18.0 outside the checkout  |

An initial database run used PostgreSQL 15.18. The recorded database result above
is the subsequent explicit PostgreSQL 17.11 run. Production artifact checks
caught missing Nitro routes for the execution Gateway and development storage;
both routes are now forwarded to Hono. The ordinary runtime gate also probes
the private Gateway's rejection of requests without a RunGrant.

## Local verification, 6 October 2026

| Check                                               | Result                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run verify` with Bun 1.4.0 and Node 24.18.0    | Passed: catalogs, policy, formatting, lint, types, tests, builds, isolated Web/API startup and packaged Worker startup                                                      |
| Dedicated PostgreSQL 17 test database               | 20 tests passed, including concurrency, budgets, fencing and atomic publication                                                                                             |
| Real browser suite against a separate test database | 42 tests passed, including history paging, account isolation, review, responsive layouts and real Better Auth session revocation                                            |
| Compiled Worker exports                             | Actual Chinese PDF, XLSX/CSV and eight-page PPTX/PDF conversion passed                                                                                                      |
| Isolated Worker artifact                            | Started without the source checkout; Pi runtime resources and dependency closure resolved                                                                                   |
| Redis initial connection failure                    | Real Node API retained login/history/logout; retained cookies failed both live SSE and fresh reads; graceful shutdown exited successfully                                   |
| Redis lost after healthy startup                    | New AI input returned 503 without creating a Turn/Run; real login/history/logout and retained-cookie rejection remained available; owned API/Redis processes exited cleanly |

Browser delivery fixtures are explicitly synthetic database records. They verify
authorization, persisted facts and UI behavior; they do not establish that a live
model produced those files. Document export probes use the actual generators
and converters. Provider-bound unit tests use deterministic injected adapters.

## Live release gate

The repository implementation is ready for environment acceptance. Live model,
Brave Search and private S3 credentials were unavailable in this session. Docker
was unavailable locally; CI is configured to build the Worker image and run its
real document export probe, but that CI result has not been observed here.
Remote cache credentials were also unavailable; local restore and trust/signature
policy checks passed, while a live remote-cache round trip remains unverified.
No production deployment was performed.

Use [deployment configuration](../architecture/deployment.md) to provision a new
PostgreSQL database, Redis, private object bucket and matching API/Worker values.
Do not apply the fresh baseline to the historical business database. Configure
positive account quotas before enabling Search or Computer; provide real model
and search credentials through the deployment environment.

With the real providers enabled, complete the release path in Web: search a
topic, inspect its citations, upload CSV, generate a report and spreadsheet,
generate an eight-page deck, revise the same Task, accept its current revision,
and inspect notifications and model usage. Check the actual downloaded files
and PDF previews. Repeat cancellation, provider failure and object-upload
recovery against that environment before publishing the release.

The review surfaces are `/chat`, `/tasks`, `/settings/usage`, `/notifications`
and the authorized operational metadata page `/admin-runs`. Desktop cloud
integration, browser/GUI execution, arbitrary code and payments remain later
phases of ADR-0016.
