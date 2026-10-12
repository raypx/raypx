# Account-first V2

> Status: accepted, September 12, 2026.

V2 starts from the Account and Project relationships rather than carrying the
old Workspace and Project Studio model forward. A user may own any number of
personal Projects. A Project has exactly one scope: a personal owner or an
Organization. `createdByUserId` records attribution and audit history; it is
not an authorization shortcut.

The domain is split into stable contexts: projects, assets, reviews,
cloud execution, outbox, and activity. API and Worker are two composition roots over the same
application commands. PostgreSQL repositories own persistence details, the
outbox connects committed commands to durable Agent work, and object storage is
used for direct blob uploads.

Project capability evaluation is centralized. Personal ownership grants
management; project members grant editor, commenter, or viewer access. For an
Organization Project, organization membership establishes the upper bound and
project membership may only narrow it. API handlers, workers, and repositories
must call the same evaluator.

The canonical API is account-first and exposes health, authentication
capabilities, account, projects, tasks, members, assets and reviews, plus the cloud Conversation/Task/Run protocol.
Admin is retired under [ADR-0021](./decisions/0021-retire-admin.md). Workspace, Project Studio,
Pi-session, settings, remote-command, scheduled-task, and preview procedures
are removed. No legacy data migration or offline synchronization protocol is
part of this release. Organization tables and repository ports are present so
opening Organization later adds scope and membership operations without
changing project resource ownership. The former Project AgentRun/device protocol
is retired under [ADR-0019](./decisions/0019-retire-legacy-desktop-execution.md).

The API and Worker now use the canonical router and shared application boundary.
Cloud execution, immutable files and delivery acceptance are described in
[the cloud platform](./cloud-platform.md). Organization management remains a
reserved capability; Desktop manages canonical projects and tasks.
