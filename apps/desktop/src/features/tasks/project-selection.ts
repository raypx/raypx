import type { SyncDevice } from "@raypx/contracts/tasks";

export function selectLocalProject(
  devices: SyncDevice[] | undefined,
  input: {
    project: string | null;
    device: string | null;
    recent: readonly string[];
  },
) {
  const device = devices?.[0];
  const deviceId = input.device ?? device?.id;
  const projects = device?.projects ?? [];
  const projectId =
    input.project ??
    input.recent.find((id) => projects.some((project) => project.id === id)) ??
    projects[0]?.id;
  const project =
    deviceId === device?.id ? projects.find((candidate) => candidate.id === projectId) : undefined;
  return {
    device,
    deviceId,
    projectId,
    project,
    selectionInvalid: Boolean(
      devices && ((input.project && !project) || (input.device && deviceId !== device?.id)),
    ),
  };
}
