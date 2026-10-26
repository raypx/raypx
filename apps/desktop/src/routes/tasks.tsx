import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace";
export const Route = createFileRoute("/tasks")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { scope?: "local" | "remote"; history?: "account" } => ({
    ...(search.scope === "remote" || search.scope === "local" ? { scope: search.scope } : {}),
    ...(search.history === "account" ? { history: search.history } : {}),
  }),
  component: Tasks,
});
function Tasks() {
  const { scope } = Route.useSearch();
  return <DesktopTaskWorkspace view="tasks" initialScope={scope ?? "local"} />;
}
