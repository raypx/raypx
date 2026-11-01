import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary";
import { useTranslations } from "@raypx/i18n/browser";
import { taskClient } from "../../features/tasks/client";
import { apiUrl } from "../../features/auth/client";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
export const Route = createFileRoute("/(app)/approvals")({
  staticData: { page: { title: "common.approvals", layout: "workbench" } },
  component: Page,
});
function Page() {
  const g = useTranslations("guest");
  const router = useRouter();
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={g("approvals")} description={g("approvalsHint")} />}
    >
      {(accountId) => (
        <TaskWorkspace
          client={reportedClient}
          scope={{ kind: "remote", namespace: apiUrl, accountId }}
          view="approvals"
          onOpenTask={(task) =>
            void router.navigate({
              to: "/tasks",
              search: { project: task.projectId, device: task.deviceId, taskId: task.id },
            })
          }
        />
      )}
    </SessionBoundary>
  );
}
