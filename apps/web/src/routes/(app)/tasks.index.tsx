import { useSuspenseQuery } from "@tanstack/react-query";
import { cloudQueries } from "../../lib/cloud-queries";
import { useCloudQueries } from "../../lib/use-cloud-queries";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@voidmix/ui/page-header";
import { StatusBadge } from "@voidmix/ui/status-badge";
import { useTranslations } from "../../i18n/client";
import { createRouteApiClient } from "../../lib/route-api";
import {
  RouteError,
  RoutePending,
  PageNavigation,
  pageSearch,
} from "../../features/navigation/route-state";
import { taskLabels } from "../../features/conversations/labels";
export const Route = createFileRoute("/(app)/tasks/")({
  validateSearch: pageSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      cloudQueries(context, createRouteApiClient()).tasks(deps.cursor),
    );
    return { accountId: context.accountId };
  },
  component: TasksPage,
  pendingComponent: RoutePending,
  errorComponent: RouteError,
});
function TasksPage() {
  const { queries } = useCloudQueries();
  const {
    data: { items, nextCursor },
  } = useSuspenseQuery(queries.tasks(Route.useSearch().cursor));
  const t = useTranslations("cloud");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const labels = taskLabels(t);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t("tasks")} description={t("description")} />
      {items.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((task) => (
            <li key={task.id} className="flex min-w-0 items-center justify-between gap-5 py-5">
              <Link
                className="min-w-0 wrap-anywhere hover:underline"
                to="/tasks/$taskId"
                params={{ taskId: task.id }}
              >
                {task.title}
              </Link>
              <StatusBadge
                label={labels[task.status]}
                tone={task.status === "completed" ? "success" : "neutral"}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">{t("noTasks")}</p>
      )}
      <PageNavigation
        cursor={search.cursor}
        nextCursor={nextCursor}
        onNavigate={(cursor) => void navigate({ search: cursor ? { cursor } : {} })}
      />
    </div>
  );
}
