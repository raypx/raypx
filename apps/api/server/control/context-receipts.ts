import { type AgentTask, type RelayRequest } from "@raypx/contracts/tasks";
import type { ControlTransaction } from "./repository.js";

import { type ContextCommand, canonical, hash } from "./records.js";
export async function releaseContextCommand(tx: ControlTransaction, task: AgentTask) {
  if (task.parentTaskId !== null || !task.context?.sources.length) return;
  const previous = await tx.get<ContextCommand>("command", task.id);
  if (!previous || previous.deviceId !== task.deviceId) return;
  const request: RelayRequest = {
    method: "tasks.create",
    input: {
      id: task.id,
      deviceId: task.deviceId,
      projectId: task.projectId,
      provider: task.provider,
      mode: task.mode,
      prompt: task.prompt,
      contextSelection: {
        sources: task.context.sources.map(({ id, revision }) => ({ id, revision })),
      },
    },
  };
  if (
    (previous.context &&
      previous.request &&
      canonical(previous.context) === canonical(task.context) &&
      canonical(previous.request) === canonical(request)) ||
    (previous.compacted &&
      previous.requestHash &&
      previous.requestHash === (await hash(canonical(request) ?? "")))
  )
    await tx.remove("command", task.id);
}
