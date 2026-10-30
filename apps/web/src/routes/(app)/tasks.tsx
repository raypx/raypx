import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client";
import { createFileRoute } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { SessionBoundary } from "../../features/auth/components/session-boundary";
import { GuestTasks } from "../../features/tasks/guest";
import { useGuestDraft } from "../../features/tasks/guest-draft";
import { LoadingState } from "@raypx/ui/loading-state";
import { useTranslations } from "@raypx/i18n/browser";
import { apiUrl } from "../../features/auth/client";
import { taskClient } from "../../features/tasks/client";
import { accountMemory } from "../../features/memory/client";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const Route = createFileRoute("/(app)/tasks")({
  staticData: { page: { title: "common.tasks", layout: "workbench" } },
  validateSearch: (search: Record<string, unknown>): { taskId?: string; guestDraft?: string } => ({
    ...(typeof search.taskId === "string" && uuid.test(search.taskId)
      ? { taskId: search.taskId }
      : {}),
    ...(typeof search.guestDraft === "string" && uuid.test(search.guestDraft)
      ? { guestDraft: search.guestDraft }
      : {}),
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
  const { taskId } = Route.useSearch();
  const resume = useGuestDraft(apiUrl, accountId);
  const g = useTranslations("guest");
  if (!resume.ready) return <LoadingState label={g("restoring")} />;
  return (
    <>
      {resume.failed && (
        <p role="alert" className="mb-4 text-sm text-destructive-text">
          {g("restoreFailed")}
        </p>
      )}
      <TaskWorkspace
        contextLibrary={accountMemory}
        client={reportedClient}
        scope={{ kind: "remote", namespace: apiUrl, accountId }}
        view="tasks"
        initialDraft={resume.draft}
        onDraftRestored={resume.restored}
        initialTaskId={taskId}
      />
    </>
  );
}
