import type {
  AgentTask,
  AgentProvider,
  ModelSelection,
  TaskContinuation,
  TaskFollowUp,
} from "@raypx/core/tasks";
import type { SyncDevice } from "@raypx/contracts/tasks";
import type { DraftInput } from "./drafts.js";
import { isTaskActive } from "./task.js";

export function taskSelection(
  devices: SyncDevice[],
  deviceId: string,
  projectId: string,
  provider: AgentProvider,
) {
  const device = devices.find((entry) => entry.id === deviceId);
  const project = device?.projects.find((entry) => entry.id === projectId);
  const capability = device?.capabilities.find((entry) => entry.provider === provider);
  return {
    device,
    project,
    capability,
    requiresModel: capability?.definition.modelSelection ?? false,
  };
}
export function canCreateTask(
  selection: ReturnType<typeof taskSelection>,
  mode: AgentTask["mode"],
  model: ModelSelection | undefined,
  modelReady: boolean,
) {
  return Boolean(
    selection.device?.online &&
    !selection.device.revoked &&
    selection.capability &&
    selection.project?.providers.includes(selection.capability.provider) &&
    selection.capability?.available &&
    selection.capability.definition.modes.includes(mode) &&
    (!selection.requiresModel || (modelReady && model)),
  );
}
export function canContinueTask(
  task: AgentTask,
  continuation: TaskContinuation | undefined,
  devices: SyncDevice[],
  modelReady: boolean,
) {
  const selection = taskSelection(devices, task.deviceId, task.projectId, task.provider);
  return (
    !continuation?.blocked &&
    canCreateTask(selection, "run", task.model, modelReady) &&
    (!selection.requiresModel || Boolean(continuation))
  );
}
export function projectOccupied(tasks: AgentTask[], deviceId: string, projectId: string) {
  return tasks.some(
    (task) => task.deviceId === deviceId && task.projectId === projectId && isTaskActive(task),
  );
}
export interface TaskSubmission {
  key: string;
  id: string;
  input: DraftInput;
  draftId: string | null;
}
export function prepareTaskSubmission(
  previous: TaskSubmission | null,
  input: DraftInput,
  draftId: string | null,
  id: () => string,
): TaskSubmission {
  const key = JSON.stringify(input);
  return previous?.key === key ? previous : { key, id: id(), input, draftId };
}
export function followUpPlan(
  id: string,
  parentTaskId: string,
  prompt: string,
  selected: ModelSelection | undefined,
  continuation: TaskContinuation | undefined,
) {
  const transfer = Boolean(
    selected && continuation && selected.connectionId !== continuation.model.connectionId,
  );
  const input: TaskFollowUp = {
    id,
    parentTaskId,
    prompt,
    ...(selected ? { model: selected } : {}),
    ...(continuation ? { contextRevision: continuation.revision } : {}),
    ...(transfer && continuation && selected
      ? {
          contextTransfer: { revision: continuation.revision, connectionId: selected.connectionId },
        }
      : {}),
  };
  return { transfer, input };
}
