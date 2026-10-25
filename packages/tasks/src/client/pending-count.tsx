import { useCallback } from "react";
import { useRemoteQuery, type TaskWorkspaceClient } from "./remote-query.js";

export function PendingCount({
  client,
  accountId,
}: {
  client: TaskWorkspaceClient;
  accountId: string | null;
}) {
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [managed, observed] = await Promise.all([
        client.approvals.list({}, { signal }),
        client.observed?.list({}, { signal }),
      ]);
      return (
        managed.length +
        (observed?.requests.filter(
          (request) => request.status === "pending" && Date.parse(request.expiresAt) > Date.now(),
        ).length ?? 0)
      );
    },
    [client],
  );
  const { data } = useRemoteQuery(["pending", accountId], load, Boolean(accountId), client);
  return data ? (
    <span className="ml-auto rounded bg-muted px-1.5 text-xs tabular-nums">{data}</span>
  ) : null;
}
