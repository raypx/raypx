import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace.js";
export const Route = createFileRoute("/approvals")({
  staticData: { page: { title: "common.approvals", layout: "workbench" } },
  validateSearch: ({ scope }: Record<string, unknown>): { scope?: "local" | "remote" } =>
    scope === "remote" || scope === "local" ? { scope } : {},
  component: Approvals,
});
function Approvals() {
  const { scope } = Route.useSearch();
  return <DesktopTaskWorkspace view="approvals" initialScope={scope ?? "local"} />;
}
