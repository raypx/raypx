import { useTranslations } from "../../i18n.js";
import { webPageGuard, PageAccessFeedback } from "../../features/auth/route-guard.js";
import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client.js";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { SessionBoundary, SignInGate } from "../../features/auth/components/session-boundary.js";

import { taskClient } from "../../features/tasks/client.js";
import { apiUrl } from "../../features/auth/client.js";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
export const Route = createFileRoute("/(app)/approvals")({
  beforeLoad: webPageGuard("/approvals"),
  errorComponent: PageAccessFeedback,
  staticData: { page: { title: "common.approvals", layout: "workbench" } },
  component: Page,
});
function Page() {
  const g = useTranslations("guest");
  const c = useTranslations("common");
  const router = useRouter();
  return (
    <SessionBoundary
      guest={<SignInGate heading="h1" title={c("approvals")} description={g("approvalsHint")} />}
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
