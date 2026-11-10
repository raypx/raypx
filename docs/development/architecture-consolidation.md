# Architecture consolidation delivery

This implementation follows the seven architecture changes requested on
2026-11-10. Completion requires code, documentation, meaningful verification and
committed, pushed changes for every item below. Native platform acceptance is
reported independently from source and headless checks.

| Item                   | Required result                                                                                                                                                           | Evidence to collect                                                                           | Status      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------- |
| 1. Core domains        | Memory/job schemas and pure calculations in Core; no Contracts dependency on feature/UI workspaces; old model entries removed                                             | Package graph, Core/Contracts and feature tests, policy                                       | In progress |
| 2. Backend roles       | One server artifact with api/relay/both roles; default combined deployment works without Redis; separate/cluster role remains supported                                   | Role and transport integration tests; build; deployment configuration and isolated acceptance | Pending     |
| 3. Thin Desktop        | ADR before implementation; daemon owns sessions, API proxy and event stream; native host retains OS UI and launch capabilities; renderer gets no credentials              | Security boundary tests, daemon tests, Go checks, platform acceptance availability            | Pending     |
| 4. Ordered streams     | Managed and observed relay channels share cursor/ack/timeout/reset mechanics                                                                                              | Replay, reset, expiry and stale-ack tests for both consumers                                  | Pending     |
| 5. Feature servers     | Task projections owned by Tasks server; context persistence owned by Memory server; Jobs persistence owned by Jobs server; Control retains transport/device authorization | Acyclic workspace/source graph; API/Relay/PostgreSQL tests                                    | Pending     |
| 6. Cancellation scopes | Each daemon connection owns an AbortController; replacements cancel pending work and stale completions cannot mutate state                                                | Replacement/disconnect race tests for managed and observed channels                           | Pending     |
| 7. Governance          | Mobile React catalog independent from DOM apps; immutable ADR convention; current architecture organized by process/data flow with topology                               | Manifests, install/policy, architecture documentation                                         | Pending     |

Preserve the local Owner Host, event-sourced CLI orchestration, explicit public
entries, account/origin enrollment, local offline identity, and policy enforcement.
Do not migrate existing operator databases or mix device/account data.

Run focused suites as each boundary changes and repository `bun run verify`
before delivery. PostgreSQL, browser and packaged native gates remain distinct;
record their actual availability and results. Commit and push all completed work.
