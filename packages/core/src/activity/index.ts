import type { CursorPage, VisibleResourceQuery } from "../pagination.js";
export interface ActivityV2 {
  id: string;
  projectId: string;
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

export interface ActivityV2Repository {
  listVisible(query: VisibleResourceQuery): Promise<CursorPage<ActivityV2>>;
  listByProject(projectId: string): Promise<ActivityV2[]>;
}
