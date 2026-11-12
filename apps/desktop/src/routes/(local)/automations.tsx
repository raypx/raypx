import { useTranslations } from "../../i18n.js";
import { createFileRoute, getRouteApi, Link, useRouter } from "@tanstack/react-router";

import { CloudJobsPage } from "@raypx/jobs/client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { localRequest } from "../../lib/desktop.js";
import { LocalJobsPage } from "../../features/automations/local.js";
import { RemoteBoundary } from "../../features/auth/components/remote-boundary.js";
import { cloudJobs, jobDevices } from "../../features/automations/client.js";
import { accountMemory } from "../../features/memory/client.js";
import { ProjectTools } from "../../features/tasks/project-tools.js";
import { ShellActions } from "@raypx/blocks/shell";

const localRoute = getRouteApi("/(local)");
export const Route = createFileRoute("/(local)/automations")({
  staticData: { page: { title: "common.jobs", layout: "workbench" } },
  preload: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope?: "local" | "cloud"; project?: string; device?: string } => ({
    ...(search.scope === "cloud" || search.scope === "local" ? { scope: search.scope } : {}),
    ...(typeof search.project === "string" && search.project.length <= 256
      ? { project: search.project }
      : {}),
    ...(typeof search.device === "string" && search.device.length <= 256
      ? { device: search.device }
      : {}),
  }),
  loaderDeps: ({ search }) => ({ scope: search.scope ?? "local" }),
  loader: async ({ context, deps }) => {
    if (!context.desktopAvailable || deps.scope === "cloud") return { jobs: null, failed: false };
    try {
      return { jobs: await localRequest("jobs.list", {}), failed: false };
    } catch {
      return { jobs: null, failed: true };
    }
  },
  pendingComponent: JobsPending,
  component: JobsPage,
});
function JobsPending() {
  const c = useTranslations("common");
  return <p role="status">{c("loading")}</p>;
}
function JobsPage() {
  const router = useRouter(),
    t = useTranslations("automations"),
    tasks = useTranslations("tasks");
  const data = Route.useLoaderData(),
    local = localRoute.useLoaderData();
  const { desktopAvailable } = Route.useRouteContext();
  const { scope = "local", project, device } = Route.useSearch();
  const localPage = (
    <LocalJobsPage
      key={project ?? "global"}
      projectId={project}
      data={data}
      local={local}
      desktopAvailable={desktopAvailable}
      refresh={() =>
        router.invalidate({
          filter: (match) =>
            match.routeId === Route.id || (local.roots === null && match.routeId === "/(local)"),
        })
      }
    />
  );
  const remotePage = (
    <RemoteBoundary>
      {(accountId) => (
        <CloudJobsPage
          target={project && device ? { projectId: project, deviceId: device } : undefined}
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
              {t("cloud.viewTask")}
            </Link>
          )}
        />
      )}
    </RemoteBoundary>
  );
  if (project) {
    const unavailable =
      scope === "cloud"
        ? !device
        : local.roots !== null && !local.roots.some((root) => root.id === project);
    return (
      <>
        <ProjectTools
          projectId={project}
          {...(device ? { deviceId: device } : {})}
          remote={scope === "cloud"}
        />
        {unavailable ? (
          <p role="alert" className="text-sm text-destructive-text">
            {tasks("projectUnavailableHint")}
          </p>
        ) : scope === "cloud" ? (
          remotePage
        ) : (
          localPage
        )}
      </>
    );
  }
  return (
    <Tabs
      value={scope}
      className="gap-6"
      onValueChange={(value) =>
        void router.navigate({
          to: "/automations",
          search: { scope: value === "cloud" ? "cloud" : "local" },
          replace: true,
        })
      }
    >
      <ShellActions>
        <TabsList aria-label={t("scope")}>
          <TabsTrigger value="local">{t("localScope")}</TabsTrigger>
          <TabsTrigger value="cloud">{t("cloudScope")}</TabsTrigger>
        </TabsList>
      </ShellActions>
      <TabsContent value="local" keepMounted>
        {localPage}
      </TabsContent>
      <TabsContent value="cloud">{remotePage}</TabsContent>
    </Tabs>
  );
}
