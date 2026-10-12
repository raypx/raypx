/** Fields supplied by a caller; persistence supplies timestamps and initial state. */
export type NewRecord<T, Defaults extends keyof T = never> = Omit<
  T,
  "createdAt" | "updatedAt" | Defaults
> & { now: Date };
export type RecordUpdate<T, Fields extends keyof T> = Pick<T, "id" & keyof T> &
  Partial<Pick<T, Fields>> & { now: Date };

export interface ProjectResource {
  id: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface AuthoredResource extends ProjectResource {
  createdByUserId: string;
}
