import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "@tanstack/react-router";
import { localTaskClient } from "./local-client";
import { isDesktop } from "../../lib/desktop";
import { recentProjects, rememberProject } from "./project-history";

/** The application owns the authorized project; tools only consume this target. */
export function useLocalProjectContext(enabled = true) {
  const location = useLocation();
  const search = new URLSearchParams(location.searchStr);
  const requested = search.get("project") ?? search.get("rootId");
  const catalog = useQuery({
    queryKey: ["desktop-project-navigation"],
    queryFn: ({ signal }) => localTaskClient.devices.list({}, { signal }),
    enabled: enabled && isDesktop(),
    staleTime: 30_000,
    retry: false,
  });
  const device = catalog.data?.[0];
  const deviceId = search.get("device") ?? device?.id;
  const projects = device?.projects ?? [];
  const projectId =
    requested ??
    recentProjects().find((id) => projects.some((project) => project.id === id)) ??
    projects[0]?.id;
  const project =
    deviceId === device?.id ? projects.find((candidate) => candidate.id === projectId) : undefined;
  useEffect(() => {
    if (enabled && project) rememberProject(project.id);
  }, [enabled, project]);
  return { ...catalog, device, deviceId, project, projectId, requested };
}
