import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace";
export const Route = createFileRoute("/approvals")({
  component: () => <DesktopTaskWorkspace view="approvals" />,
});
