import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace";
export const Route = createFileRoute("/approvals")({
  staticData: { page: { title: "common.approvals", layout: "workbench" } },
  validateSearch: (search: Record<string, unknown>): { scope?: "local" | "remote" } =>
    search.scope === "remote" || search.scope === "local" ? { scope: search.scope } : {},
  component: Approvals,
});
function Approvals() {
  const { scope } = Route.useSearch();
  return <DesktopTaskWorkspace view="approvals" initialScope={scope ?? "local"} />;
}
