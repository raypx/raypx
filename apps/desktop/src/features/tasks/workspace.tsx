import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../analytics/client";
import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { apiUrl } from "../auth/client";
import { taskClient } from "./client";
import { isDesktop } from "../../lib/desktop";
import { localTaskClient } from "./local-client";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { RemoteBoundary } from "../auth/components/remote-boundary";
import { accountMemory, localMemory } from "../memory/client";

const local = instrumentTaskClient(localTaskClient, analytics, "local");
const remote = instrumentTaskClient(taskClient, analytics, "remote");
export function DesktopTaskWorkspace({
  view,
  initialScope = "local",
}: {
  view: "tasks" | "approvals";
  initialScope?: "local" | "remote";
}) {
  const router = useRouter();
  const selectedScope = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("scope"),
  });
  const t = useTranslations("tasks"),
    c = useTranslations("common");
  const text = useTranslations("localWorkspace");
  const projectId = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("project") ?? "",
  });
  const taskId = useLocation({
    select: (location) => {
      const value = new URLSearchParams(location.searchStr).get("taskId");
      return value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
        ? value
        : undefined;
    },
  });
  return (
    <Tabs
      value={
        selectedScope === "remote" ? "remote" : selectedScope === "local" ? "local" : initialScope
      }
      className="gap-5"
      onValueChange={(value) => {
        const next = value === "remote" ? "remote" : "local";
        void router.navigate({
          to: view === "approvals" ? "/approvals" : "/tasks",
          search: { scope: next },
          replace: true,
        });
        analytics.capture("task_scope_changed", { scope: next });
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList aria-label={t("taskScope")}>
          <TabsTrigger value="local">{t("thisComputer")}</TabsTrigger>
          <TabsTrigger value="remote">{t("connectedComputers")}</TabsTrigger>
        </TabsList>
        <Link
          to="/settings"
          className="text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {t("agentSettings")}
        </Link>
      </div>
      <TabsContent value="local" className="space-y-6">
        <div className="space-y-3">
          <p className="max-w-[75ch] text-sm text-muted-foreground">{text("ownershipHint")}</p>
          <Link to="/welcome" className="text-sm underline underline-offset-4">
            {text("getStarted")}
          </Link>
        </div>
        {isDesktop() ? (
          <TaskWorkspace
            contextLibrary={localMemory}
            persistEditor
            storageNamespace={apiUrl}
            client={local}
            scope={{ kind: "device", namespace: apiUrl, workspaceId: LOCAL_WORKSPACE_ID }}
            view={view}
            projectId={projectId}
            initialTaskId={taskId}
            onProjectChange={(project) =>
              void router.navigate({
                to: "/tasks",
                search: {
                  scope: "local",
                  ...(project ? { project } : {}),
                },
              })
            }
          />
        ) : (
          <section>
            <h1>{t(view === "tasks" ? "title" : "inbox")}</h1>
            <p className="mt-4 text-sm text-muted-foreground">{c("desktopOnly")}</p>
          </section>
        )}
      </TabsContent>
      <TabsContent value="remote">
        <RemoteBoundary>
          {(remoteAccount) => (
            <TaskWorkspace
              contextLibrary={accountMemory}
              persistEditor
              storageNamespace={apiUrl}
              client={remote}
              scope={{ kind: "remote", namespace: apiUrl, accountId: remoteAccount }}
              view={view}
              initialTaskId={taskId}
            />
          )}
        </RemoteBoundary>
      </TabsContent>
    </Tabs>
  );
}
