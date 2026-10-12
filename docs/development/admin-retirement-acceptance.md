# Admin retirement and application naming acceptance

Verified locally on October 12, 2026, on macOS ARM64 with Bun 1.4.0,
Node 24.18.0 and PostgreSQL 17.11. The current scope is recorded in
[ADR-0021](../architecture/decisions/0021-retire-admin.md) and
[ADR-0022](../architecture/decisions/0022-unscoped-application-packages.md).
The earlier Desktop reduction and Electrobun migration results remain in
[the first-batch report](./feature-reduction-acceptance.md).

## Verified results

| Gate                                           | Result                                                                                                                                                                  |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen Bun installation                        | Passed with the updated lockfile                                                                                                                                        |
| Affected workspace checks and applicable tests | Passed across API, Contracts, Client, Core, Application, DB, Auth, Web, UI, Mail, Shared, I18n, Agent UI, Scripts and E2E types                                         |
| `bun run verify`                               | Passed: catalogs, policy, format, lint, types, Vitest layers, all builds, Worker and Web/API runtime probes                                                             |
| PostgreSQL integration                         | 21 tests passed in a dedicated disposable database                                                                                                                      |
| Browser E2E                                    | 38 tests passed, including cloud tools, delivery acceptance, notifications, usage, private account isolation, projects/tasks, navigation cancellation, theme and locale |
| Drizzle generation                             | No schema changes, new migration or generated drift                                                                                                                     |
| Application naming                             | Five unscoped names; naming/architecture tests passed; Web/API/Worker Turbo prune passed                                                                                |
| Storybook                                      | Root build passed; the `storybook` application resolves the external Storybook 10.6.1 SDK correctly                                                                     |
| macOS native packaging                         | Root Desktop gate and Electrobun stable DMG passed                                                                                                                      |
| Native shell                                   | Packaged `views:` assets, runtime bridge, tray creation, close/hide, restore, minimum size and tray quit passed                                                         |
| Native resources                               | Bun 1.4.0; no Node distribution, Pi or legacy runner in the stable resource archive                                                                                     |

The full gate used an isolated managed checkout containing the task's source
snapshot. Unrelated compiler output and watcher processes in the original
checkout were preserved. Only compiled siblings of explicitly retired modules
were removed. Test databases contained synthetic fixtures only.

## Preserved boundaries

Admin pages, stores, catalogs, management RPCs and their specialized permissions,
writers, bootstrap/seed commands and dependencies are absent. Retired RPC paths
return 404 for anonymous callers and every compatible stored role. Existing
`admin`/`owner` session values remain readable without granting private Cloud
access; suspended accounts remain denied.

Auth policy and Mail still resolve fixed database keys and environment/default
fallbacks. Projects, cloud execution, private storage, delivery review, account
usage and notifications retain their current authorization and persistence.
Historical SQL, the active baseline, compatibility data and local files were not
rewritten or cleaned up.

Browser cancellation now navigates to Tasks because the Admin destination is
retired. Trace inspection showed that four cold cloud pages had not yet issued
a client session request when their original five-second assertions expired.
Initial cloud visibility and authenticated layout readiness use a finite
15-second wait for the development module graph; later content, permission,
error and interaction assertions keep their existing waits. Cloud and responsive
layout subsets passed before the complete browser suite passed.

## Remaining environment gates

Windows native execution, the production HTTPS cookie/CORS flow, remote CI and
the Worker Docker/document-export gate were not run locally. Their existing
acceptance boundaries remain in [the first-batch report](./feature-reduction-acceptance.md)
and [cloud release acceptance](./cloud-acceptance.md).

The local DMG is a validation artifact configured for a synthetic loopback API.
Build a distribution artifact with its intended HTTPS API origin. Native
same-site login/restart persistence was established in the first batch; this
batch repeated shell and lifecycle acceptance without making a new production
HTTPS authentication claim.
