import type { AuthoredResource, NewRecord, RecordUpdate } from "../resources.js";
export const taskStatusesV2 = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatusV2 = (typeof taskStatusesV2)[number];

export interface TaskV2 extends AuthoredResource {
  title: string;
  status: TaskStatusV2;
}

export interface ProjectTaskV2Repository {
  getById(id: string): Promise<TaskV2 | null>;
  listByProject(projectId: string): Promise<TaskV2[]>;
  create(input: NewRecord<TaskV2, "status">): Promise<TaskV2>;
  update(input: RecordUpdate<TaskV2, "title" | "status">): Promise<TaskV2 | null>;
}
