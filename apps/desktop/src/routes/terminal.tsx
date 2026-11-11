import { createFileRoute } from "@tanstack/react-router";
import { isDesktop, localRequest } from "../lib/desktop.js";
import { recentProjects } from "../features/tasks/project-history.js";
import { TerminalPage } from "../features/terminal/page.js";

export const Route = createFileRoute("/terminal")({
  staticData: { page: { title: "common.terminal", layout: "tool" } },
  ssr: false,
  preload: false,
  validateSearch: (search: Record<string, unknown>): { project?: string } =>
    typeof search.project === "string" && search.project.length <= 256
      ? { project: search.project }
      : {},
  loaderDeps: ({ search }) => ({ project: search.project }),
  loader: async ({ deps }) => {
    if (!isDesktop()) return { project: deps.project, cwd: "" };
    const roots = await localRequest("roots.list", {});
    const project =
      deps.project ?? recentProjects().find((id) => roots.some((root) => root.id === id));
    return { project, cwd: roots.find((root) => root.id === project)?.path ?? "" };
  },
  component: TerminalRoute,
});

function TerminalRoute() {
  const project = Route.useLoaderData();
  return <TerminalPage key={project.project ?? "global"} project={project} />;
}
