import { useEffect } from "react";
import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../analytics/client.js";
import { useRouter, useLocation } from "@tanstack/react-router";
import { ProjectList, TaskProjectLink, TaskWorkspace } from "@raypx/tasks/client";
import { ShellActions } from "@raypx/blocks/shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { LoadingState } from "@raypx/ui/loading-state";
import { Button } from "@raypx/ui/components/ui/button";
import { apiUrl } from "../auth/client.js";
import { taskClient } from "./client.js";
import { isDesktop } from "../../lib/desktop.js";
import { localTaskClient } from "./local-client.js";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { RemoteBoundary } from "../auth/components/remote-boundary.js";
import { accountMemory, localMemory } from "../memory/client.js";
import { LocalWelcome } from "../onboarding/welcome.js";
import { ProjectTools } from "./project-tools.js";
import { useLocalProjectContext } from "./project-context.js";
import { rememberProject } from "./project-history.js";
import { useSettingsNavigation } from "../settings/navigation.js";

const local = instrumentTaskClient(localTaskClient, analytics, "local");
const remote = instrumentTaskClient(taskClient, analytics, "remote");
const localScope = { kind: "device", namespace: apiUrl, workspaceId: LOCAL_WORKSPACE_ID } as const;

export function DesktopTaskWorkspace({
  view,
  initialScope = "local",
}: {
  view: "tasks" | "approvals";
  initialScope?: "local" | "remote";
}) {
  const router = useRouter();
  const settings = useSettingsNavigation();
  const search = useLocation({ select: (location) => new URLSearchParams(location.searchStr) });
  const scope = search.get("scope") === "remote" ? "remote" : initialScope;
  const projectId = search.get("project") ?? "";
  const deviceId = search.get("device") ?? "";
  const compose = search.get("compose") === "true";
  const rawTask = search.get("taskId");
  const taskId = rawTask && /^[0-9a-f-]{36}$/i.test(rawTask) ? rawTask : undefined;
  const t = useTranslations("tasks"),
    c = useTranslations("common");
  function selectRemote(target: { projectId: string; deviceId: string }, linkedTask?: string) {
    void router.navigate({
      to: "/tasks",
      search: {
        scope: "remote",
        project: target.projectId,
        device: target.deviceId,
        ...(linkedTask ? { taskId: linkedTask } : {}),
        ...(compose && !linkedTask ? { compose } : {}),
      },
      hash: linkedTask ? true : "",
    });
  }
  const localView = !isDesktop() ? (
    <p className="text-sm text-muted-foreground">{c("desktopOnly")}</p>
  ) : view === "tasks" ? (
    <LocalProjectSessions taskId={taskId} compose={compose} />
  ) : (
    <TaskWorkspace
      client={local}
      scope={localScope}
      view="approvals"
      onOpenTask={(task) =>
        void router.navigate({
          to: "/tasks",
          search: {
            scope: "local",
            project: task.projectId,
            device: task.deviceId,
            taskId: task.id,
          },
        })
      }
    />
  );
  const remoteView = (
    <RemoteBoundary>
      {(accountId) => {
        const remoteScope = { kind: "remote", namespace: apiUrl, accountId } as const;
        if (view === "approvals")
          return (
            <TaskWorkspace
              client={remote}
              scope={remoteScope}
              view="approvals"
              onOpenTask={(task) =>
                selectRemote({ projectId: task.projectId, deviceId: task.deviceId }, task.id)
              }
            />
          );
        if ((!projectId || !deviceId) && taskId)
          return (
            <TaskProjectLink
              client={remote}
              scope={remoteScope}
              taskId={taskId}
              onSelect={(target) => selectRemote(target, taskId)}
            />
          );
        if (!projectId || !deviceId)
          return (
            <ProjectList
              client={remote}
              scope={remoteScope}
              onSelect={selectRemote}
              connectionAction={
                <Button variant="link" aria-haspopup="dialog" onClick={() => void settings.open()}>
                  {t("agentSettings")}
                </Button>
              }
            />
          );
        return (
          <>
            <ProjectTools remote projectId={projectId} deviceId={deviceId} />
            <TaskWorkspace
              client={remote}
              scope={remoteScope}
              contextLibrary={accountMemory}
              actionsSlot={ShellActions}
              persistEditor
              projectId={projectId}
              {...(deviceId ? { deviceId } : {})}
              initialTaskId={taskId}
              newSession={compose}
              onNewSessionShown={() =>
                void router.navigate({
                  to: "/tasks",
                  search: { scope: "remote", project: projectId, device: deviceId },
                  replace: true,
                })
              }
              onTaskChange={(id) =>
                void router.navigate({
                  to: "/tasks",
                  search: {
                    scope: "remote",
                    project: projectId,
                    ...(deviceId ? { device: deviceId } : {}),
                    ...(id ? { taskId: id } : {}),
                  },
                })
              }
            />
          </>
        );
      }}
    </RemoteBoundary>
  );
  if (view === "tasks") return scope === "remote" ? remoteView : localView;
  return (
    <Tabs
      value={scope}
      className="gap-5"
      onValueChange={(value) =>
        void router.navigate({
          to: "/approvals",
          search: { scope: value === "remote" ? "remote" : "local" },
        })
      }
    >
      <ShellActions>
        <TabsList aria-label={t("taskScope")}>
          <TabsTrigger value="local">{t("thisComputer")}</TabsTrigger>
          <TabsTrigger value="remote">{t("connectedComputers")}</TabsTrigger>
        </TabsList>
      </ShellActions>
      <TabsContent value="local">{localView}</TabsContent>
      <TabsContent value="remote">{remoteView}</TabsContent>
    </Tabs>
  );
}

function LocalProjectSessions({
  taskId,
  compose,
}: {
  taskId?: string | undefined;
  compose: boolean;
}) {
  const context = useLocalProjectContext();
  const router = useRouter();
  const c = useTranslations("common"),
    t = useTranslations("tasks");
  useEffect(() => {
    if (!context.project || !context.device || taskId || context.requested) return;
    void router.navigate({
      to: "/tasks",
      search: {
        scope: "local",
        project: context.project.id,
        device: context.device.id,
        ...(compose ? { compose } : {}),
      },
      hash: true,
      replace: true,
    });
  }, [context.project, context.device, context.requested, router, taskId, compose]);
  useEffect(() => {
    if (context.project) rememberProject(context.project.id);
  }, [context.project]);
  if (context.isPending) return <LoadingState label={c("loading")} />;
  if (context.isError)
    return (
      <div role="alert">
        <p>{t("LOCAL_UNAVAILABLE")}</p>
        <Button variant="outline" onClick={() => void context.refetch()}>
          {c("retry")}
        </Button>
      </div>
    );
  if (!context.requested && taskId)
    return (
      <TaskProjectLink
        client={local}
        scope={localScope}
        taskId={taskId}
        onSelect={(target) =>
          void router.navigate({
            to: "/tasks",
            search: { scope: "local", project: target.projectId, device: target.deviceId, taskId },
            hash: true,
            replace: true,
          })
        }
      />
    );
  if (!context.projectId) return <LocalWelcome />;
  const projectId = context.projectId,
    deviceId = context.deviceId;
  return (
    <>
      <ProjectTools projectId={projectId} {...(deviceId ? { deviceId } : {})} />
      <TaskWorkspace
        client={local}
        scope={localScope}
        contextLibrary={localMemory}
        actionsSlot={ShellActions}
        persistEditor
        projectId={projectId}
        {...(deviceId ? { deviceId } : {})}
        initialTaskId={taskId}
        newSession={compose}
        onNewSessionShown={() =>
          void router.navigate({
            to: "/tasks",
            search: {
              scope: "local",
              project: projectId,
              ...(deviceId ? { device: deviceId } : {}),
            },
            hash: true,
            replace: true,
          })
        }
        onTaskChange={(id) =>
          void router.navigate({
            to: "/tasks",
            search: {
              scope: "local",
              project: projectId,
              ...(deviceId ? { device: deviceId } : {}),
              ...(id ? { taskId: id } : {}),
            },
          })
        }
      />
    </>
  );
}
