import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client";
import { createFileRoute } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { useTranslations } from "@raypx/i18n/browser";
import { taskClient } from "../../features/tasks/client";
import { apiUrl } from "../../features/auth/client";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
export const Route = createFileRoute("/(app)/approvals")({ component: Page });
function Page() {
  const g = useTranslations("guest");
  return (
    <SessionBoundary
      guest={
        <div className="mx-auto max-w-5xl px-8 py-7 max-[760px]:px-5">
          <SignInGate heading="h1" title={g("approvals")} description={g("approvalsHint")} />
        </div>
      }
    >
      {(accountId) => (
        <TaskWorkspace
          client={reportedClient}
          scope={{ kind: "remote", namespace: apiUrl, accountId }}
          view="approvals"
        />
      )}
    </SessionBoundary>
  );
}
