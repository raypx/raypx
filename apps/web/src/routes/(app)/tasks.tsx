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
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
export const Route = createFileRoute("/(app)/tasks")({ component: Page });
function Page() {
  return (
    <SessionBoundary guest={<GuestTasks client={reportedClient} namespace={apiUrl} />}>
      {(accountId) => <SignedInTasks accountId={accountId} />}
    </SessionBoundary>
  );
}
function SignedInTasks({ accountId }: { accountId: string }) {
  const resume = useGuestDraft(apiUrl, accountId);
  const g = useTranslations("guest");
  if (!resume.ready) return <LoadingState label={g("restoring")} />;
  return (
    <>
      {resume.failed && (
        <p role="alert" className="px-8 pt-4 text-sm text-destructive-text">
          {g("restoreFailed")}
        </p>
      )}
      <TaskWorkspace
        draftNamespace={apiUrl}
        client={reportedClient}
        accountId={accountId}
        view="tasks"
        initialDraft={resume.draft}
        onDraftRestored={resume.restored}
      />
    </>
  );
}
