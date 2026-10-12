import { createFileRoute, useRouter } from "@tanstack/react-router";
import { cloudRunStatusSchema } from "@voidmix/contracts";
import { createRouteApiClient } from "../../../lib/route-api";
import { AdminRunDirectory } from "../../../features/admin/runs/run-directory";
import { pageSearch, RouteError, RoutePending } from "../../../features/navigation/route-state";

export const Route = createFileRoute("/(app)/(admin)/admin-runs")({
  validateSearch: (input: Record<string, unknown>) => {
    const status = cloudRunStatusSchema.safeParse(input.status);
    return {
      ...pageSearch(input),
      ...(status.success ? { status: status.data } : {}),
      ...(typeof input.accountId === "string" && input.accountId.trim()
        ? { accountId: input.accountId.trim().slice(0, 200) }
        : {}),
      ...(typeof input.runId === "string" && input.runId
        ? { runId: input.runId.slice(0, 200) }
        : {}),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: async ({ deps, context, abortController }) => {
    const api = createRouteApiClient();
    const options = { signal: abortController.signal };
    const [runs, inspection, usage] = await Promise.all([
      api.cloud.admin.runs.list(
        {
          limit: 50,
          ...(deps.cursor ? { cursor: deps.cursor } : {}),
          ...(deps.status ? { status: deps.status } : {}),
          ...(deps.accountId ? { accountId: deps.accountId } : {}),
        },
        options,
      ),
      deps.runId ? api.cloud.admin.runs.get({ runId: deps.runId }, options) : null,
      deps.accountId ? api.cloud.admin.usage.get({ accountId: deps.accountId }, options) : null,
    ]);
    return { accountId: context.accountId, runs, inspection, usage };
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }] }),
  pendingComponent: RoutePending,
  errorComponent: RouteError,
  component: AdminRunsPage,
});

function AdminRunsPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  return (
    <AdminRunDirectory
      key={page.accountId + ":" + (search.accountId ?? "")}
      page={page}
      search={search}
      onSearch={(search) => navigate({ search })}
      reload={() => router.invalidate()}
    />
  );
}
