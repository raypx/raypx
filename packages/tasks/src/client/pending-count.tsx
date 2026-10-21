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
    (signal: AbortSignal) => client.approvals.list({}, { signal }),
    [client],
  );
  const { data } = useRemoteQuery(["approvals", accountId], load, Boolean(accountId), client);
  return data?.length ? (
    <span className="ml-auto rounded bg-muted px-1.5 text-xs tabular-nums">{data.length}</span>
  ) : null;
}
