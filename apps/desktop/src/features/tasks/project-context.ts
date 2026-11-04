import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { useProjectCatalog } from "./project-catalog";
import { selectLocalProject } from "./project-selection";
import { recentProjects, rememberProject } from "./project-history";

/** The application owns the authorized project; tools only consume this target. */
export function useLocalProjectContext(enabled = true) {
  const location = useLocation();
  const search = new URLSearchParams(location.searchStr);
  const requested = search.get("project") ?? search.get("rootId");
  const catalog = useProjectCatalog(enabled);
  const selection = selectLocalProject(catalog.data, {
    project: requested,
    device: search.get("device"),
    recent: recentProjects(),
  });
  const { project } = selection;
  useEffect(() => {
    if (enabled && project) rememberProject(project.id);
  }, [enabled, project]);
  return { ...catalog, ...selection, requested };
}
