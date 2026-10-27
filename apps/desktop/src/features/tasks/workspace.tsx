import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../analytics/client";
import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@raypx/ui/components/ui/tabs";
import { useTranslations } from "@raypx/i18n/browser";
import { apiUrl, authClient } from "../auth/client";
import { taskClient } from "./client";
import { isDesktop } from "../../lib/desktop";
import { localTaskClient, accountLocalTaskClient } from "./local-client";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";
import { RemoteBoundary } from "../auth/components/remote-boundary";
import { SelectField } from "@raypx/ui/select-field";
import { useId } from "react";
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
  const session = authClient.useSession(),
    t = useTranslations("tasks"),
    c = useTranslations("common");
  const accountId = session.error || session.isPending ? null : (session.data?.user.id ?? null);
  const text = useTranslations("localWorkspace");
  const legacy = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("history") === "account",
  });
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
  const owner = legacy && accountId ? accountId : LOCAL_WORKSPACE_ID;
  const sourceId = useId();
  return (
    <Tabs
      value={
        selectedScope === "remote" ? "remote" : selectedScope === "local" ? "local" : initialScope
      }
      className="gap-0"
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
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-4 px-8 pt-6 max-[760px]:px-5">
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
      <TabsContent value="local">
        <div className="mx-auto w-full max-w-[1600px] space-y-3 px-8 pt-5 max-[760px]:px-5">
          <p className="max-w-[75ch] text-sm text-muted-foreground">
            {text(legacy ? "legacyHint" : "ownershipHint")}
          </p>
          {accountId && (
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor={sourceId} className="text-sm">
                {text("source")}
              </label>
              <SelectField
                id={sourceId}
                value={legacy ? "account" : "device"}
                onValueChange={(value) =>
                  void router.navigate({
                    to: view === "approvals" ? "/approvals" : "/tasks",
                    search: {
                      scope: "local",
                      ...(value === "account" ? { history: "account" as const } : {}),
                    },
                    replace: true,
                  })
                }
                options={[
                  { value: "device", label: text("deviceSource") },
                  { value: "account", label: text("legacySource") },
                ]}
              />
            </div>
          )}
          <Link to="/welcome" className="text-sm underline underline-offset-4">
            {text("getStarted")}
          </Link>
        </div>
        {legacy && !accountId ? (
          <div className="px-8">
            <RemoteBoundary>{() => null}</RemoteBoundary>
          </div>
        ) : isDesktop() ? (
          <TaskWorkspace
            contextLibrary={legacy ? undefined : localMemory}
            key={owner}
            persistEditor
            storageNamespace={apiUrl}
            client={legacy ? accountLocalTaskClient : local}
            scope={
              legacy && accountId
                ? { kind: "account-local", namespace: apiUrl, accountId }
                : { kind: "device", namespace: apiUrl, workspaceId: LOCAL_WORKSPACE_ID }
            }
            view={view}
            projectId={projectId}
            initialTaskId={taskId}
            onProjectChange={(project) =>
              void router.navigate({
                to: "/tasks",
                search: {
                  scope: "local",
                  ...(legacy ? { history: "account" as const } : {}),
                  ...(project ? { project } : {}),
                },
              })
            }
          />
        ) : (
          <section className="mx-auto w-full max-w-[1600px] px-10 py-10">
            <h1>{t(view === "tasks" ? "title" : "inbox")}</h1>
            <p className="mt-4 text-sm text-muted-foreground">{c("desktopOnly")}</p>
          </section>
        )}
      </TabsContent>
      <TabsContent value="remote">
        <div className="mx-auto w-full max-w-[1600px] px-8 max-[760px]:px-5">
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
        </div>
      </TabsContent>
    </Tabs>
  );
}
