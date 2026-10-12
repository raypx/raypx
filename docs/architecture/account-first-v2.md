# Account-first V2

> Status: accepted, September 12, 2026.

V2 starts from the Account and Project relationships rather than carrying the
old Workspace and Project Studio model forward. A user may own any number of
personal Projects. A Project has exactly one scope: a personal owner or an
Organization. `createdByUserId` records attribution and audit history; it is
not an authorization shortcut.

The domain is split into stable contexts: identity, projects, assets, reviews,
agents, and activity. API and Worker are two composition roots over the same
application commands. PostgreSQL repositories own persistence details, the
outbox connects committed commands to durable Agent work, and object storage is
used for direct blob uploads.

Project capability evaluation is centralized. Personal ownership grants
management; project members grant editor, commenter, or viewer access. For an
Organization Project, organization membership establishes the upper bound and
project membership may only narrow it. API handlers, workers, and repositories
must call the same evaluator.

The canonical API is account-first and exposes health, authentication
capabilities, account, projects, tasks, members, assets, reviews, AgentRuns,
and the minimal admin directory/audit surface. Workspace, Project Studio,
Pi-session, settings, remote-command, scheduled-task, and preview procedures
are removed. No legacy data migration or offline synchronization protocol is
part of this release. Organization tables and repository ports are present so
opening Organization later adds scope and membership operations without
changing Task, Asset, Review, or AgentRun ownership.

The API and Worker now use the canonical router and shared application boundary.
The next implementation slice is to finish the direct object-storage adapter,
lease recovery coverage, and Organization management without reintroducing a
second project API.
