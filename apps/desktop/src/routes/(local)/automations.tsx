import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router";
import type { JobDefinition } from "@raypx/jobs";
import { CloudJobsPage } from "@raypx/jobs/client";
import { useTranslations } from "@raypx/i18n/browser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { localRequest } from "../../lib/desktop";
import { LocalJobsPage } from "../../features/automations/local";
import { RemoteBoundary } from "../../features/auth/components/remote-boundary";
import { cloudJobs, jobDevices } from "../../features/automations/client";
import { accountMemory } from "../../features/memory/client";

const localRoute = getRouteApi("/(local)");
export const Route = createFileRoute("/(local)/automations")({
  preload: false,
  validateSearch: (search: Record<string, unknown>): { scope?: "local" | "cloud" } =>
    search.scope === "cloud" || search.scope === "local" ? { scope: search.scope } : {},
  loaderDeps: ({ search }) => ({ scope: search.scope ?? "local" }),
  loader: async ({ context, deps }) => {
    if (!context.desktopAvailable || deps.scope === "cloud") return { jobs: null, failed: false };
    try {
      return { jobs: await localRequest<JobDefinition[]>("jobs.list", {}), failed: false };
    } catch {
      return { jobs: null, failed: true };
    }
  },
  pendingComponent: JobsPending,
  component: JobsPage,
});
function JobsPending() {
  const c = useTranslations("common");
  return (
    <section className="mx-auto max-w-[1320px] px-8 py-9">
      <p role="status">{c("loading")}</p>
    </section>
  );
}
function JobsPage() {
  const router = useRouter(),
    t = useTranslations("jobs"),
    cloud = useTranslations("cloudJobs");
  const data = Route.useLoaderData(),
    local = localRoute.useLoaderData();
  const { desktopAvailable } = Route.useRouteContext(),
    { scope = "local" } = Route.useSearch();
  return (
    <Tabs
      value={scope}
      onValueChange={(value) =>
        void router.navigate({
          to: "/automations",
          search: { scope: value === "cloud" ? "cloud" : "local" },
          replace: true,
        })
      }
      className="gap-0"
    >
      <div className="mx-auto w-full max-w-[1320px] px-8 pt-6">
        <TabsList aria-label={t("scope")}>
          <TabsTrigger value="local">{t("localScope")}</TabsTrigger>
          <TabsTrigger value="cloud">{t("cloudScope")}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="local" keepMounted>
        <LocalJobsPage
          data={data}
          local={local}
          desktopAvailable={desktopAvailable}
          refresh={() =>
            router.invalidate({
              filter: (match) =>
                match.routeId === Route.id ||
                (local.roots === null && match.routeId === "/(local)"),
            })
          }
        />
      </TabsContent>
      <TabsContent value="cloud">
        <div className="mx-auto max-w-[1320px] px-8">
          <RemoteBoundary>
            {(accountId) => (
              <CloudJobsPage
                contextLibrary={accountMemory}
                accountId={accountId}
                client={cloudJobs}
                devices={jobDevices}
                renderTaskLink={(taskId) => (
                  <Link
                    to="/tasks"
                    search={{ scope: "remote", taskId }}
                    className="underline underline-offset-4"
                  >
                    {cloud("viewTask")}
                  </Link>
                )}
              />
            )}
          </RemoteBoundary>
        </div>
      </TabsContent>
    </Tabs>
  );
}
