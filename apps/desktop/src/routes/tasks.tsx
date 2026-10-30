import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace";
export const Route = createFileRoute("/tasks")({
  staticData: { page: { title: "common.tasks", layout: "workbench" } },
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope?: "local" | "remote"; history?: "account"; project?: string; taskId?: string } => ({
    ...(search.scope === "remote" || search.scope === "local" ? { scope: search.scope } : {}),
    ...(search.history === "account" ? { history: search.history } : {}),
    ...(typeof search.project === "string" && search.project.length <= 256 && search.project
      ? { project: search.project }
      : {}),
    ...(typeof search.taskId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(search.taskId)
      ? { taskId: search.taskId }
      : {}),
  }),
  component: Tasks,
});
function Tasks() {
  const { scope } = Route.useSearch();
  return <DesktopTaskWorkspace view="tasks" initialScope={scope ?? "local"} />;
}
