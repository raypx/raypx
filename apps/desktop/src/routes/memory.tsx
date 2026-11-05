import { createFileRoute, useRouter } from "@tanstack/react-router";
import { MemoryLibraryPage } from "@raypx/memory/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { RemoteBoundary } from "../features/auth/components/remote-boundary.tsx";
import {
  accountMemory,
  memoryProjects,
  memoryUsage,
  localMemory,
  localMemoryProjects,
} from "../features/memory/client.ts";
import { isDesktop } from "../lib/desktop.ts";
import { useLocalProjectContext } from "../features/tasks/project-context.ts";
import { ProjectTools } from "../features/tasks/project-tools.tsx";
import { ShellActions } from "@raypx/blocks/shell";
import { LoadingState } from "@raypx/ui/loading-state";
export const Route = createFileRoute("/memory")({
  staticData: { page: { title: "memory.title", layout: "workbench" } },
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope?: "local" | "account"; project?: string; device?: string } => ({
    ...(search.scope === "account" || search.scope === "local" ? { scope: search.scope } : {}),
    ...(typeof search.project === "string" && search.project.length <= 256
      ? { project: search.project }
      : {}),
    ...(typeof search.device === "string" && search.device.length <= 256
      ? { device: search.device }
      : {}),
  }),
  component: Page,
});
function Page() {
  const { scope = "local", project, device } = Route.useSearch(),
    router = useRouter(),
    t = useTranslations("memory");
  const context = useLocalProjectContext(scope === "local" && Boolean(project));
  const tasks = useTranslations("tasks"),
    c = useTranslations("common");
  const targetDevice = scope === "local" ? context.deviceId : device;
  const target =
    project && targetDevice ? { deviceId: targetDevice, projectId: project } : undefined;
  const localPage = isDesktop() ? (
    <MemoryLibraryPage
      client={localMemory}
      projects={localMemoryProjects}
      ownerKey="device"
      scope="device"
      target={target}
    />
  ) : (
    <p className="text-sm text-muted-foreground">{t("desktopOnly")}</p>
  );
  const remotePage = (
    <RemoteBoundary>
      {(accountId) => (
        <MemoryLibraryPage
          client={accountMemory}
          projects={memoryProjects}
          usage={memoryUsage}
          ownerKey={accountId}
          scope="account"
          target={target}
        />
      )}
    </RemoteBoundary>
  );
  if (project)
    return (
      <>
        <ProjectTools
          projectId={project}
          {...(targetDevice ? { deviceId: targetDevice } : {})}
          remote={scope === "account"}
        />
        {scope === "local" && context.isPending ? (
          <LoadingState label={c("loading")} />
        ) : !target || (scope === "local" && !context.project) ? (
          <p role="alert" className="text-sm text-destructive-text">
            {tasks("projectUnavailableHint")}
          </p>
        ) : scope === "local" ? (
          localPage
        ) : (
          remotePage
        )}
      </>
    );
  return (
    <Tabs
      value={scope}
      onValueChange={(value) =>
        void router.navigate({
          to: "/memory",
          search: { scope: value === "account" ? "account" : "local" },
          replace: true,
        })
      }
      className="gap-6"
    >
      <ShellActions>
        <TabsList aria-label={t("scope")}>
          <TabsTrigger value="local">{t("localScope")}</TabsTrigger>
          <TabsTrigger value="account">{t("accountScope")}</TabsTrigger>
        </TabsList>
      </ShellActions>
      <TabsContent value="local" keepMounted>
        {localPage}
      </TabsContent>
      <TabsContent value="account">{remotePage}</TabsContent>
    </Tabs>
  );
}
