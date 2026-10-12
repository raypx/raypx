import { queryOptions, type QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@voidmix/client";

export interface QueryIdentity {
  actorId: string;
  accountId: string;
}
export type QueryScope = { type: "personal" } | { type: "project"; projectId: string };
export const personalScope: QueryScope = { type: "personal" };
export function cloudKey(
  identity: QueryIdentity,
  scope: QueryScope,
  resource: string,
  ...id: readonly unknown[]
) {
  return [
    "cloud",
    identity.actorId,
    identity.accountId,
    scope.type === "project" ? scope.projectId : "personal",
    resource,
    ...id,
  ] as const;
}

/** Only ordinary server resources belong here. Live Conversation/Run projections stay in Sessions. */
export function cloudQueries(identity: QueryIdentity, api: ApiClient) {
  const key = (resource: string, ...id: readonly unknown[]) =>
    cloudKey(identity, personalScope, resource, ...id);
  return {
    capabilities: () =>
      queryOptions({
        queryKey: key("capabilities"),
        queryFn: ({ signal }) => api.cloud.capabilities.get({}, { signal }),
        staleTime: 15_000,
      }),
    usage: () =>
      queryOptions({
        queryKey: key("usage"),
        queryFn: ({ signal }) => api.cloud.usage.get({}, { signal }),
        staleTime: 15_000,
      }),
    conversations: (cursor?: string) =>
      queryOptions({
        queryKey: key("conversations", cursor ?? null),
        queryFn: ({ signal }) =>
          api.cloud.conversations.list({ limit: 50, ...(cursor ? { cursor } : {}) }, { signal }),
      }),
    tasks: (cursor?: string, projectId?: string) =>
      queryOptions({
        queryKey: cloudKey(
          identity,
          projectId ? { type: "project", projectId } : personalScope,
          "tasks",
          cursor ?? null,
        ),
        queryFn: ({ signal }) =>
          api.cloud.tasks.list(
            { limit: 50, ...(cursor ? { cursor } : {}), ...(projectId ? { projectId } : {}) },
            { signal },
          ),
      }),
    task: (taskId: string) =>
      queryOptions({
        queryKey: key("task", taskId),
        queryFn: ({ signal }) => api.cloud.tasks.get({ taskId }, { signal }),
      }),
    projects: () =>
      queryOptions({
        queryKey: key("projects"),
        queryFn: ({ signal }) => api.projects.list({ limit: 50 }, { signal }),
      }),
    project: (projectId: string) =>
      queryOptions({
        queryKey: cloudKey(identity, { type: "project", projectId }, "project"),
        queryFn: ({ signal }) => api.projects.get({ projectId }, { signal }),
      }),
    members: (projectId: string) =>
      queryOptions({
        queryKey: cloudKey(identity, { type: "project", projectId }, "members"),
        queryFn: ({ signal }) => api.projects.members.list({ projectId }, { signal }),
      }),
    spendingGrants: (projectId: string) =>
      queryOptions({
        queryKey: cloudKey(identity, { type: "project", projectId }, "spending-grants"),
        queryFn: ({ signal }) => api.cloud.tasks.listSpendingGrants({ projectId }, { signal }),
      }),
    notifications: () =>
      queryOptions({
        queryKey: key("notifications"),
        queryFn: ({ signal }) => api.cloud.notifications.list({ limit: 100 }, { signal }),
      }),
    preferences: () =>
      queryOptions({
        queryKey: key("preferences"),
        queryFn: ({ signal }) => api.cloud.preferences.get({}, { signal }),
      }),
    asset: (assetVersionId: string) =>
      queryOptions({
        queryKey: key("file", assetVersionId),
        queryFn: ({ signal }) => api.cloud.assets.get({ assetVersionId }, { signal }),
        staleTime: 60_000,
      }),
  };
}

/** Terminal facts refresh just the owning task, lists, allowance and notifications once. */
export async function invalidateRunFacts(
  client: QueryClient,
  identity: QueryIdentity,
  taskId: string | null,
) {
  await client.invalidateQueries({
    predicate: ({ queryKey }) =>
      queryKey[0] === "cloud" &&
      queryKey[1] === identity.actorId &&
      queryKey[2] === identity.accountId &&
      (["tasks", "conversations", "usage", "capabilities", "notifications"].includes(
        String(queryKey[4]),
      ) ||
        (queryKey[4] === "task" && queryKey[5] === taskId)),
  });
}
