export interface CursorQuery {
  limit?: number;
  cursor?: string;
}
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface VisibleResourceQuery extends CursorQuery {
  actorId: string;
  projectId?: string;
}
