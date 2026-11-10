# Architecture consolidation delivery

This implementation follows the seven architecture changes requested on
2026-11-10. Completion requires code, documentation, meaningful verification and
committed, pushed changes for every item below. Native platform acceptance is
reported independently from source and headless checks.

| Item                   | Required result                                                                                                                                                           | Evidence to collect                                                                           | Status   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------- |
| 1. Core domains        | Memory/job schemas and pure calculations in Core; no Contracts dependency on feature/UI workspaces; old model entries removed                                             | Package graph, Core/Contracts and feature tests, policy                                       | Verified |
| 2. Backend roles       | One server artifact with api/relay/both roles; default combined deployment works without Redis; separate/cluster role remains supported                                   | Role and transport integration tests; build; deployment configuration and isolated acceptance | Verified |
| 3. Thin Desktop        | ADR before implementation; daemon owns sessions, API proxy and event stream; native host retains OS UI and launch capabilities; renderer gets no credentials              | Security boundary tests, daemon tests, Go checks, platform acceptance availability            | Pending  |
| 4. Ordered streams     | Managed and observed relay channels share cursor/ack/timeout/reset mechanics                                                                                              | Replay, reset, expiry and stale-ack tests for both consumers                                  | Pending  |
| 5. Feature servers     | Task projections owned by Tasks server; context persistence owned by Memory server; Jobs persistence owned by Jobs server; Control retains transport/device authorization | Acyclic workspace/source graph; API/Relay/PostgreSQL tests                                    | Verified |
| 6. Cancellation scopes | Each daemon connection owns an AbortController; replacements cancel pending work and stale completions cannot mutate state                                                | Replacement/disconnect race tests for managed and observed channels                           | Pending  |
| 7. Governance          | Mobile React catalog independent from DOM apps; immutable ADR convention; current architecture organized by process/data flow with topology                               | Manifests, install/policy, architecture documentation                                         | Verified |

Preserve the local Owner Host, event-sourced CLI orchestration, explicit public
entries, account/origin enrollment, local offline identity, and policy enforcement.
Do not migrate existing operator databases or mix device/account data.

Run focused suites as each boundary changes and repository `bun run verify`
before delivery. PostgreSQL, browser and packaged native gates remain distinct;
record their actual availability and results. Commit and push all completed work.

## Verification evidence

- Core: type check and 40 tests passed; Contracts: type check and 16 tests passed.
- Feature ownership: Control 65, API 110, Tasks 142, Memory 43 and Jobs 23 tests
  passed. Types passed for Tasks, Control, API and Jobs; repository policy passed.
- PostgreSQL: all 11 suites / 58 tests passed against a newly provisioned,
  disposable `raypx_architecture_test` container database; the container and its
  data were removed. No operator database was used.
- Mobile: types and Expo dependency alignment passed; iOS and Android production
  JavaScript/Hermes bundle exports passed. Device/simulator acceptance was not run.
- `bun run verify` passed for items 1, 5 and 7: all 75 selected tasks completed,
  including source checks/tests, policy/locales and current-platform Go host
  checks/tests. Earlier failed/intermediate runs are superseded by this passing run.
  Changes to the remaining items require fresh verification before delivery.

- Backend roles: API 125, Tooling 299 (one skipped), Railway 4 and Cloudflare 23
  tests passed. API/Tooling types and policy passed. A single relocated Nitro
  output passed api/both/relay role probes; the relay role started without Auth
  inputs and exposed no RPC. Both Compose topology files passed syntax checks.
- Backend live services: 58 PostgreSQL, 10 cluster/role and 4 Redis tests passed
  against owned disposable services. Combined dispatch/revoke used no Redis URL;
  split dispatch/revoke used a separate process. All owned containers were removed.
- Real linux/amd64 image acceptance passed for Compose (combined, Redis not
  started) and Railway (split roles sharing one backend image). Both profiles
  passed migrations, readiness, SSR/assets, synthetic login, secure cookies and
  Relay. All owned containers, networks, builder and images were removed. Evidence:
  `.artifacts/deployment/2026-11-10T14-16-18-886Z-2e5c6b8b/results.json`.
- `bun run verify` passed all 73 selected tasks for item 2 in 224.1 seconds.
  Live Cloudflare/Railway deployment and native GUI acceptance were not run.
  Hono CLI could not start on Bun 1.4.4 (`node:module.registerHooks` unavailable);
  the HTTP boundary was covered by integration tests and real artifact/image probes.
