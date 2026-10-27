# Raypx documentation

- [Architecture and runtime boundaries](architecture/README.md)
- [Opt-in browser analytics](architecture/analytics.md)
- [Remote Agent tasks and approvals](architecture/remote-tasks.md)
- [Internationalization and device preferences](architecture/internationalization.md)
- [Account settings and session management](development/account-security.md)
- [Adding and extracting packages](development/workspaces.md)
- [Shared logger workspace](../packages/logger/README.md)
- [Development environment and commands](development/getting-started.md)
- [Desktop connection configuration](development/desktop-configuration.md)
- [Pi AI model calls](development/ai.md)
- [Testing and release gates](development/testing.md)
- [Test case ownership and consolidation](development/test-cases.md)
- [Full test inventory and restructuring, 2026-10-27](development/test-audit-2026-10-27.md)
- [Node and Cloudflare deployments](development/cloudflare.md)
- [Shared deployment per project](development/deployment.md)
- [Existing beta environment](development/beta.md)
- [Production environment](development/production.md)
- [Administrator configuration](development/configuration.md)
- [Server caching](development/caching.md)
- [Object storage](development/object-storage.md)
- [Server jobs and expired-record cleanup](development/server-jobs.md)
- [Memory, templates and task context](development/task-context.md)
- [Memory review remediation](development/memory-review-ffcc9bd.md)
- [Raypx Kit library changes](development/intl-release.md)
- [Foundation acceptance results](development/foundation-acceptance.md)
- [Review remediation, 2026-10-25](development/review-remediation-2026-10-25.md)
- [Terminal protocol P0 implementation](development/terminal-protocol-p0.md)
- [Independent terminal host P1](development/terminal-host-p1.md)
- [Terminal host P1 review remediation](development/terminal-host-p1-review.md)
- [Foundation decision](architecture/0034-extensible-foundation.md)
- [Historical documentation](history/README.md)

Only the current documents above describe the active product. Earlier cloud,
worker and business-layer designs are retained as historical context.

## Proposed designs

- [多 Agent 宿主与 Expo 移动 App](plans/terminal-session-host.md)
- [CLI, terminal interaction and desktop execution](plans/cli-desktop-runtime.md)
- [Web mobile capabilities](plans/web-mobile-capabilities.md)

These plans describe proposed work and acceptance gates, not shipped capabilities.
The multi-Agent host plan reflects the latest mobile direction: an Expo App and
remote approvals replace the earlier Web-only, read-only mobile proposal.
