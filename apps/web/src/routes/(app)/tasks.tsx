import { useTranslations } from "../../i18n.js";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard.js";
import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client.js";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ProjectList, TaskProjectLink, TaskWorkspace } from "@raypx/tasks/client";
import { SessionBoundary } from "../../features/auth/components/session-boundary.js";
import { GuestTasks } from "../../features/tasks/guest.js";
import { useGuestDraft } from "../../features/tasks/guest-draft.js";
import { LoadingState } from "@raypx/ui/loading-state";

import { apiUrl } from "../../features/auth/client.js";
import { taskClient } from "../../features/tasks/client.js";
import { accountMemory } from "../../features/memory/client.js";
import { ProjectTools } from "../../features/tasks/project-tools.js";
import { ShellActions } from "@raypx/blocks/shell";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const Route = createFileRoute("/(app)/tasks")({
  beforeLoad: webPageGuard("/tasks"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "common.tasks", layout: "workbench" } },
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    taskId?: string;
    project?: string;
    device?: string;
    guestDraft?: string;
    compose?: true;
  } => ({
    ...(typeof search.project === "string" && uuid.test(search.project)
      ? { project: search.project }
      : {}),
    ...(typeof search.device === "string" && uuid.test(search.device)
      ? { device: search.device }
      : {}),
    ...(typeof search.taskId === "string" && uuid.test(search.taskId)
      ? { taskId: search.taskId }
      : {}),
    ...(typeof search.guestDraft === "string" && uuid.test(search.guestDraft)
      ? { guestDraft: search.guestDraft }
      : {}),
    ...(search.compose === true ? { compose: true as const } : {}),
  }),
  component: Page,
});
function Page() {
  return (
    <SessionBoundary guest={<GuestTasks client={reportedClient} namespace={apiUrl} />}>
      {(accountId) => <SignedInTasks accountId={accountId} />}
    </SessionBoundary>
  );
}
function SignedInTasks({ accountId }: { accountId: string }) {
  const { taskId, project, device, guestDraft, compose } = Route.useSearch();
  const router = useRouter();
  const resume = useGuestDraft(apiUrl, accountId);
  const g = useTranslations("guest");
  const t = useTranslations("tasks");
  const scope = { kind: "remote", namespace: apiUrl, accountId } as const;
  const select = (target: { projectId: string; deviceId: string }, linkedTask?: string) =>
    void router.navigate({
      to: "/tasks",
      search: {
        project: target.projectId,
        device: target.deviceId,
        ...(linkedTask ? { taskId: linkedTask } : {}),
        ...(guestDraft ? { guestDraft } : {}),
        ...(compose && !linkedTask ? { compose } : {}),
      },
    });
  if (!resume.ready) return <LoadingState label={g("restoring")} />;
  if ((!project || !device) && taskId)
    return (
      <TaskProjectLink
        client={reportedClient}
        scope={scope}
        taskId={taskId}
        onSelect={(target) => select(target, taskId)}
      />
    );
  if (!project)
    return (
      <>
        {resume.draft && (
          <p className="mb-5 text-sm text-muted-foreground">{t("draft.chooseProject")}</p>
        )}
        <ProjectList
          client={reportedClient}
          scope={scope}
          onSelect={select}
          connectionAction={
            <Link to="/settings" className="text-sm underline underline-offset-4">
              {t("agentSettings")}
            </Link>
          }
        />
      </>
    );
  return (
    <>
      {resume.failed && (
        <p role="alert" className="mb-4 text-sm text-destructive-text">
          {g("restoreFailed")}
        </p>
      )}
      <ProjectTools projectId={project} deviceId={device} />
      {device && (
        <TaskWorkspace
          contextLibrary={accountMemory}
          actionsSlot={ShellActions}
          client={reportedClient}
          scope={scope}
          persistEditor
          {...(device ? { deviceId: device } : {})}
          view="tasks"
          initialDraft={resume.draft}
          onDraftRestored={resume.restored}
          initialTaskId={taskId}
          newSession={compose}
          onNewSessionShown={() =>
            void router.navigate({
              to: "/tasks",
              search: {
                ...(project ? { project } : {}),
                ...(device ? { device } : {}),
                ...(guestDraft ? { guestDraft } : {}),
              },
              replace: true,
            })
          }
          {...(project ? { projectId: project } : {})}
          onTaskChange={(id) =>
            void router.navigate({
              to: "/tasks",
              search: { project, ...(device ? { device } : {}), ...(id ? { taskId: id } : {}) },
            })
          }
        />
      )}
    </>
  );
}
