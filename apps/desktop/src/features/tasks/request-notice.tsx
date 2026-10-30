import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useTranslations } from "@raypx/i18n/browser";
import { Button } from "@raypx/ui/components/ui/button";
import { onLocalEvent } from "../../lib/desktop";
import { localTaskClient } from "./local-client";

export function TerminalRequestNotice({ accountId }: { accountId: string | null }) {
  const t = useTranslations("tasks"),
    router = useRouter(),
    queries = useQueryClient();
  const { data } = useQuery({
    queryKey: ["terminal-request-notice", accountId],
    enabled: Boolean(localTaskClient.observed),
    queryFn: async ({ signal }) =>
      (await localTaskClient.observed!.list({}, { signal })).requests.filter(
        (request) => request.status === "pending" && Date.parse(request.expiresAt) > Date.now(),
      ).length,
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(
    () =>
      onLocalEvent((event) => {
        if (event.event === "observed.changed")
          void queries.invalidateQueries({ queryKey: ["terminal-request-notice", accountId] });
      }),
    [queries, accountId],
  );
  if (!data) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted px-8 py-3 @max-2xl/main:px-5"
    >
      <p className="text-sm">{t("terminalPendingNotice", { count: data })}</p>
      <Button
        size="sm"
        onClick={() => void router.navigate({ to: "/approvals", search: { scope: "local" } })}
      >
        {t("reviewRequests")}
      </Button>
    </div>
  );
}
