import { instrumentTaskClient } from "@raypx/analytics/browser";
import { analytics } from "../../features/analytics/client";
import { createFileRoute } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { authClient } from "../../features/auth/client";
import { taskClient } from "../../features/tasks/client";
const reportedClient = instrumentTaskClient(taskClient, analytics, "remote");
export const Route = createFileRoute("/(app)/tasks")({ component: Page });
function Page() {
  const session = authClient.useSession();
  return (
    <TaskWorkspace
      client={reportedClient}
      accountId={session.data?.user.id ?? null}
      pending={session.isPending}
      view="tasks"
    />
  );
}
