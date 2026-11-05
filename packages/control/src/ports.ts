import type { ControlRecords, RecordKind, ObservedSummary } from "./schemas.ts";
export type { RecordKind } from "./schemas.ts";
export interface ControlRecord {
  id: string;
  deviceId: string;
}
export interface ControlQuery {
  taskId?: string;
  projectId?: string;
  beforeTask?: string;
  pendingApprovals?: boolean;
  activity?: boolean;
  after?: number;
  beforeActivity?: number;
  limit?: number;
  streamId?: string;
  descending?: boolean;
  ids?: string[];
  observedAt?: string;
}
/** Query options belong to the record being read. */
type ControlQueries = {
  device: Pick<ControlQuery, "limit" | "ids">;
  project: Pick<ControlQuery, "limit" | "ids">;
  task: Pick<ControlQuery, "limit" | "beforeTask" | "projectId">;
  request: Pick<ControlQuery, "limit" | "taskId" | "pendingApprovals">;
  event: Pick<
    ControlQuery,
    "limit" | "taskId" | "streamId" | "after" | "beforeActivity" | "activity" | "descending"
  >;
  command: Pick<ControlQuery, "limit">;
  grant: Pick<ControlQuery, "limit">;
  credential: Pick<ControlQuery, "limit">;
  observed_session: Pick<ControlQuery, "limit" | "ids">;
  observed_request: Pick<ControlQuery, "limit" | "observedAt" | "ids">;
};
export interface ControlTransaction {
  sessionActive(id: string, now: Date): Promise<boolean>;
  securityVersion(): Promise<string>;
  hostSessionAllowed(createdAt: Date): Promise<boolean>;
  revokeHostSecurity(): Promise<void>;
  get<K extends RecordKind>(kind: K, id: string): Promise<ControlRecords[K] | undefined>;
  list<K extends RecordKind>(
    kind: K,
    deviceId?: string,
    query?: ControlQueries[NoInfer<K>],
  ): Promise<ControlRecords[K][]>;
  observedSummaries(query: { observedAt: string; limit: number }): Promise<ObservedSummary[]>;
  put<K extends RecordKind>(kind: K, value: ControlRecords[NoInfer<K>]): Promise<ControlRecords[K]>;
  remove(kind: RecordKind, id: string): Promise<void>;
  pruneEvents(deviceId: string, streamId: string, orphans?: boolean): Promise<void>;
  pruneCommands(now: Date): Promise<void>;
  purgeObserved(deviceId: string): Promise<void>;
}
export type ControlReader = Omit<
  ControlTransaction,
  "put" | "remove" | "pruneEvents" | "pruneCommands" | "purgeObserved" | "revokeHostSecurity"
>;
export interface ControlRepository {
  read<T>(userId: string, run: (tx: ControlReader) => Promise<T>): Promise<T>;
  transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T>;
  deviceTransaction<T>(
    userId: string,
    deviceId: string,
    run: (tx: ControlTransaction) => Promise<T>,
  ): Promise<T>;
  findGrant(hash: string): Promise<{ userId: string } | undefined>;
  findCredential(hash: string): Promise<{ userId: string } | undefined>;
}
