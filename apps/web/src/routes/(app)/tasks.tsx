import { createFileRoute } from "@tanstack/react-router";
import { TaskWorkspace } from "@raypx/tasks/client";
import { authClient } from "../../features/auth/client";
import { apiClient } from "../../features/tasks/client";
export const Route = createFileRoute("/(app)/tasks")({ component: Page });
function Page() {
  const session = authClient.useSession();
  return (
    <TaskWorkspace
      client={apiClient}
      accountId={session.data?.user.id ?? null}
      pending={session.isPending}
      view="tasks"
    />
  );
}
