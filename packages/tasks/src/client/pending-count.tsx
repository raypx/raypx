import { useCallback } from "react";
import { useTranslations } from "@raypx/i18n/browser";
import { useRemoteQuery } from "./remote-query.js";
import type { TaskWorkspacePort } from "../model/port.js";

export function PendingCount({
  client,
  accountId,
}: {
  client: TaskWorkspacePort;
  accountId: string | null;
}) {
  const t = useTranslations("tasks");
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [managed, observed] = await Promise.allSettled([
        client.approvals.list({}, { signal }),
        client.observed?.list({}, { signal }),
      ]);
      signal.throwIfAborted();
      if (managed.status === "rejected" && observed.status === "rejected")
        throw new Error("Approvals unavailable");
      return {
        count:
          (managed.status === "fulfilled" ? managed.value.length : 0) +
          (observed.status === "fulfilled"
            ? (observed.value?.requests.filter(
                (request) =>
                  request.status === "pending" && Date.parse(request.expiresAt) > Date.now(),
              ).length ?? 0)
            : 0),
        incomplete: managed.status === "rejected" || observed.status === "rejected",
      };
    },
    [client],
  );
  const { data, error } = useRemoteQuery(["pending", accountId], load, Boolean(accountId), client);
  const count = data?.count ?? 0,
    incomplete = error || data?.incomplete;
  const label = t(incomplete ? "pendingCountPartial" : "pendingCount", { count: String(count) });
  return count || incomplete ? (
    <span
      aria-label={label}
      title={label}
      className="ml-auto rounded bg-muted px-1.5 text-xs tabular-nums"
    >
      {count ? `${count}${incomplete ? "+" : ""}` : "?"}
    </span>
  ) : null;
}
