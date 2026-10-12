import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@voidmix/ui/page-header";
import { useTranslations, useFormatter } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import { RouteError, RoutePending } from "../../features/navigation/route-state";
export const Route = createFileRoute("/(app)/settings/usage")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      cloudQueries(context, createRouteApiClient()).usage(),
    );
    return { accountId: context.accountId };
  },
  component: UsagePage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function UsagePage() {
  const { queries } = useCloudQueries();
  const { data: usage } = useSuspenseQuery({
    ...queries.usage(),
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
  const t = useTranslations("cloud");
  const formatter = useFormatter();
  const values = [
    { label: t("calls"), value: `${usage.calls} / ${usage.limits.accountCalls}` },
    { label: t("reservedCalls"), value: usage.reservedCalls },
    { label: t("unknownCalls"), value: usage.unknownCalls },
    { label: t("inputTokens"), value: formatter.number(usage.inputTokens) },
    { label: t("outputTokens"), value: formatter.number(usage.outputTokens) },
    {
      label: t("estimatedCost"),
      value: formatter.number(usage.estimatedCost, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }),
    },
    {
      label: t("storage"),
      value: `${formatter.number(usage.storageBytes / 1024 / 1024, { maximumFractionDigits: 1 })} / ${formatter.number(usage.limits.accountStorageBytes / 1024 / 1024, { maximumFractionDigits: 1 })} MiB`,
    },
    {
      label: t("activeRuns"),
      value: `${usage.activeRuns} / ${usage.limits.accountConcurrentRuns}`,
    },
  ];
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("usage")} description={t("usageDescription")} />
      {usage.unknownCalls ? (
        <p role="status" className="rounded-lg border border-border p-4 text-sm">
          {t("unknownNotice")}
        </p>
      ) : null}
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {values.map((item) => (
          <div key={item.label} className="rounded-lg border border-border p-5">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="mt-3 text-2xl font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h2 className="text-lg font-semibold">{t("taskBudget")}</h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t("taskCalls")}</dt>
            <dd className="mt-2 tabular-nums">{usage.limits.taskCalls}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">{t("taskDuration")}</dt>
            <dd className="mt-2 tabular-nums">{usage.limits.taskDurationMs / 60000}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
