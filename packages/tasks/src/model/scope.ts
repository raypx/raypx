/** Data ownership is independent of the currently signed-in browser session. */
export type WorkspaceScope =
  | { kind: "device"; namespace: string; workspaceId: string }
  | { kind: "remote"; namespace: string; accountId: string };

export function workspaceOwner(scope: WorkspaceScope) {
  return scope.kind === "device" ? scope.workspaceId : scope.accountId;
}

export function isLocalWorkspace(scope: WorkspaceScope) {
  return scope.kind === "device";
}

/** Draft storage is scoped to its data owner. */
export function workspaceDraftKey(scope: WorkspaceScope) {
  return JSON.stringify([
    "raypx.task-drafts.v1",
    scope.namespace,
    workspaceOwner(scope),
    isLocalWorkspace(scope),
  ]);
}

export function workspaceScopeKey(scope: WorkspaceScope) {
  return JSON.stringify([scope.kind, scope.namespace, workspaceOwner(scope)]);
}
