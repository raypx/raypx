export type DiagnosticRoute = "/health" | "/ready" | "/api/auth/*" | "/rpc/*" | "unmatched";

interface RequestFields {
  requestId: string;
  method: string;
  route: DiagnosticRoute;
  status: number;
  code: string;
  durationMs: number;
}
export interface ApiEventFields {
  "http.request": RequestFields;
  "rpc.request": RequestFields & { rpc: { system: string; method: string } };
  "job.cleanup": {
    status: number;
    code: string;
    job: {
      name: "maintenance:cleanup";
      status: "completed" | "skipped" | "disabled";
      sessions: string;
      verifications: string;
      rateLimits: string;
      observedRequests: string;
      observedSessions: string;
      contextReceipts: string;
    };
  };
  "job.schedules": {
    status: number;
    code: string;
    job: {
      name: "schedules:tick";
      status: "completed" | "disabled";
      claimed: string;
      reconciled: string;
      failed: string;
    };
  };
}
export type ApiOperation = keyof ApiEventFields;
export type ApiEventStart =
  | ({ operation: "http.request" | "rpc.request" } & Pick<
      RequestFields,
      "requestId" | "method" | "route"
    >)
  | { operation: "job.cleanup" | "job.schedules" };

export interface ApiEventLogger<Operation extends ApiOperation> {
  set(fields: Partial<ApiEventFields[Operation]>): void;
  emit(fields?: Partial<ApiEventFields[Operation]>): void;
  error(error: Error): void;
}
export type CreateApiEvent = <Operation extends ApiOperation>(
  fields: ApiEventStart & { operation: Operation },
) => ApiEventLogger<Operation>;
