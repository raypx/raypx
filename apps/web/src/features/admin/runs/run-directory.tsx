import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { cloudRunStatusSchema } from "@voidmix/contracts";
import type { ApiClient } from "@voidmix/client";
import { Button } from "@voidmix/ui/components/ui/button";
import { Input } from "@voidmix/ui/components/ui/input";
import { Badge } from "@voidmix/ui/components/ui/badge";
import { PageHeader } from "@voidmix/ui/page-header";
import { useTranslations } from "../../../i18n/client";
import { useSession } from "../../../lib/auth-client";
import { PageNavigation, RoutePending } from "../../navigation/route-state";

export type AdminRunSearch = {
  cursor?: string;
  status?: "queued" | "running" | "needs_input" | "succeeded" | "failed" | "cancelled";
  accountId?: string;
  runId?: string;
};
type AdminApi = ApiClient["cloud"]["admin"];
interface AdminRunDirectoryProps {
  page: {
    accountId: string;
    runs: Awaited<ReturnType<AdminApi["runs"]["list"]>>;
    inspection: Awaited<ReturnType<AdminApi["runs"]["get"]>> | null;
    usage: Awaited<ReturnType<AdminApi["usage"]["get"]>> | null;
  };
  search: AdminRunSearch;
  onSearch: (search: AdminRunSearch) => Promise<unknown>;
  reload: () => Promise<unknown>;
}

export function AdminRunDirectory({ page, search, onSearch, reload }: AdminRunDirectoryProps) {
  const t = useTranslations("adminRuns");
  const session = useSession();
  const [account, setAccount] = useState(search.accountId ?? "");
  if (session.data?.user.id && session.data.user.id !== page.accountId) return <RoutePending />;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        action={
          <Button variant="outline" onClick={() => void reload()}>
            {t("refresh")}
          </Button>
        }
      />
      <Link to="/admin" className="text-sm underline underline-offset-4">
        {t("users")}
      </Link>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onSearch({
            ...(search.status ? { status: search.status } : {}),
            ...(account.trim() ? { accountId: account.trim() } : {}),
          });
        }}
      >
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
          {t("account")}
          <Input
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          {t("status")}
          <select
            className="h-9 rounded-md border border-input bg-background px-3 focus-visible:outline-2 focus-visible:outline-ring"
            value={search.status ?? ""}
            onChange={(event) => {
              const status = cloudRunStatusSchema.safeParse(event.target.value);
              void onSearch({
                ...(search.accountId ? { accountId: search.accountId } : {}),
                ...(status.success ? { status: status.data } : {}),
              });
            }}
          >
            <option value="">{t("all")}</option>
            {cloudRunStatusSchema.options.map((status) => (
              <option key={status} value={status}>
                {t(status)}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">{t("filter")}</Button>
      </form>
      {page.usage ? (
        <section className="rounded-lg border border-border p-4" aria-label={t("accountUsage")}>
          <h2 className="mb-3 font-semibold">{t("accountUsage")}</h2>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label={t("calls")} value={page.usage.calls} />
            <Metric label={t("unknown")} value={page.usage.unknownCalls} />
            <Metric label={t("inputTokens")} value={page.usage.inputTokens} />
            <Metric label={t("outputTokens")} value={page.usage.outputTokens} />
          </dl>
        </section>
      ) : null}
      {page.inspection ? (
        <section
          className="min-w-0 rounded-lg border border-border p-4"
          aria-label={t("inspection")}
        >
          <h2 className="mb-3 font-semibold">{t("inspection")}</h2>
          <p className="mb-4 break-all font-mono text-xs">{page.inspection.run.id}</p>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label={t("status")} value={t(page.inspection.run.status)} />
            <Metric label={t("attempt")} value={page.inspection.run.attempt} />
            <Metric label={t("epoch")} value={page.inspection.run.epoch} />
            <Metric label={t("sequence")} value={page.inspection.run.lastSequence} />
            <Metric label={t("calls")} value={page.inspection.usage.calls} />
            <Metric label={t("unknown")} value={page.inspection.usage.unknownCalls} />
            <Metric
              label={t("failure")}
              value={
                page.inspection.run.failureCode ? t(page.inspection.run.failureCode) : t("none")
              }
            />
            <Metric
              label={t("cancel")}
              value={page.inspection.run.cancelRequested ? t("yes") : t("no")}
            />
          </dl>
        </section>
      ) : null}
      {page.runs.items.length ? (
        <ul className="grid min-w-0 gap-3 lg:grid-cols-2" aria-label={t("title")}>
          {page.runs.items.map((run) => (
            <li key={run.id} className="min-w-0 rounded-lg border border-border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{t(run.status)}</Badge>
                <span className="text-sm text-muted-foreground">{t(run.mode)}</span>
              </div>
              <Link
                to="/admin-runs"
                search={{ ...search, runId: run.id }}
                className="block break-all font-mono text-xs underline underline-offset-4"
              >
                {run.id}
              </Link>
              <p className="mt-2 break-all text-xs text-muted-foreground">
                {t("account")}: {run.requestedByUserId}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("attemptValue", { attempt: run.attempt, sequence: run.lastSequence })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-muted-foreground" role="status">
          {t("empty")}
        </p>
      )}
      <PageNavigation
        cursor={search.cursor}
        nextCursor={page.runs.nextCursor}
        onNavigate={(cursor) => {
          const { cursor: _prior, ...filters } = search;
          void onSearch({ ...filters, ...(cursor ? { cursor } : {}) });
        }}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}
