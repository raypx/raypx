import { createFileRoute } from "@tanstack/react-router";
import { DesktopTaskWorkspace } from "../features/tasks/workspace";
export const Route = createFileRoute("/tasks")({
  component: () => <DesktopTaskWorkspace view="tasks" />,
});
