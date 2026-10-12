# Clean Signal Workspace

## Routes and ownership

Home (`/`) reads one aggregate Home View Model from the workspace data source.
`/projects` supports search and creation. `/projects/$projectId` owns overview,
tasks, Pi history, activity, and settings; `tab` and `filter` are validated URL
search parameters. `/projects/$projectId/pi/$sessionId` is a standalone,
project-bound conversation. Invalid project/session URLs show recovery links.

Web owns `ProjectCard`, `TaskList`, `ActivityList`, and `RunTimeline`. Shared UI
owns only `PageHeader`, `EmptyState`, and `StatusBadge` for these product
patterns; primitive controls use explicit package subpaths. The existing chat route and its local-chat
compatibility components keep their route and storage responsibilities while
message records use locale-neutral metadata: user text stays verbatim, and
deterministic preview responses persist a catalog key with an English fallback.
The root route uses `CleanHome`.

## Data and honesty

The preview source remains the default for the public preview routes. Project
Studio contracts and API handlers now exist, and the first live server slice
supports project and task reads/writes through `PostgresProjectRepository`.
The authenticated route group injects the remote source; it never falls back
to preview data after a network or authorization failure.

The remaining live gates are documented in
[`project-studio.md`](../architecture/project-studio.md): direct object-storage
HTTP for Blob bytes, durable Pi execution and reconnect, authenticated device
revocation and online sync status, real PostgreSQL migration evidence, opaque
keyset cursors, and the 256 KiB snapshot ceiling. Review/Feedback and the
existing Blob/Pi repository slices are implementation seams; their presence
does not make the corresponding UI or production boundary complete.

The adapter keeps projects, tasks, activities and conversations together in
`sessionStorage` under `voidmix.project-studio.preview.v2`. A versioned schema
validates restored data and revives dates at this browser-storage boundary.
Malformed data returns to the seed; storage unavailability leaves in-memory
editing usable. Normal updates persist across a refresh in the same tab.
Previously running sessions become stopped on reload, never silently resumed.
Closing the tab discards the preview. State is not shared with user accounts.

Views use a stable snapshot subscription and named operations from the facade;
the home asks for an aggregate, rather than issuing per-widget requests.
Hydration has loading, failure and retry UI. Source injection permits tests
without network access. The live adapter maps authorized oRPC DTOs from
`@voidmix/client` into these same view models and surfaces real failures; it
does not import the server-side `@voidmix/ai` package into Web.

## Interaction contract

- Home opens a project-bound conversation without performing a mutation in
  that project. Three templates populate the command input.
- Pi explains its preview capabilities, confirms creation of one local task,
  shows three ordered steps, and supports cancellation and retry. Navigating
  away aborts the local run. Results link to the project task list and support
  undo. This is not natural-language inference or live SDK streaming.
- Tasks support title/owner/priority/status editing and undo of the last write.
  Project settings support editing, archive confirmation, restore and undo.
- Search groups projects, tasks, conversations and pages; Ctrl/Cmd+K opens it.
  Modal controls use Base UI for focus management and Escape dismissal.
- Permission settings explicitly explain that member management is available
  only with an active Workspace membership and project management access.

## Verification

```bash
bun run --cwd apps/web test -- src/features/projects src/features/pi
bun run --cwd packages/ui test:component
bun run verify
```

Use the Start Vite plugin through dev/build to regenerate routes; never edit
`routeTree.gen.ts`. Browser checks cover 1280px, 768px, and 390px layouts, Pi
cancel/retry, same-tab reload, task undo and settings persistence. Real-data
and live Pi integration checks require the remaining backend work; they are
not represented by preview tests. Direct Blob transport, device revocation,
and real PostgreSQL migration checks are also outside preview verification.
