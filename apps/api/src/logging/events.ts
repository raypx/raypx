import type { httpApiPrefix } from "@raypx/contracts/api";

export type DiagnosticRoute =
  | "/health"
  | "/ready"
  | "/api/auth/*"
  | "/api/docs"
  | "/api/openapi.json"
  | `${typeof httpApiPrefix}/*`
  | "/rpc/*"
  | "unmatched";

interface RequestFields {
  requestId: string;
  method: string;
  route: DiagnosticRoute;
  status: number;
  code: string;
  durationMs: number;
}
interface ApiEventFields {
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
      contextReceipts: string;
    };
  };
  /** A configured Relay broker did not attach at startup; it keeps reconnecting. */
  "relay.cluster": { status: number; code: string };
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
type ApiOperation = keyof ApiEventFields;
type ApiEventStart =
  | ({ operation: "http.request" | "rpc.request" } & Pick<
      RequestFields,
      "requestId" | "method" | "route"
    >)
  | { operation: "job.cleanup" | "job.schedules" | "relay.cluster" };

export interface ApiEventLogger<Operation extends ApiOperation> {
  set(fields: Partial<ApiEventFields[Operation]>): void;
  emit(fields?: Partial<ApiEventFields[Operation]>): void;
  error(error: Error): void;
}
export type CreateApiEvent = <Operation extends ApiOperation>(
  fields: ApiEventStart & { operation: Operation },
) => ApiEventLogger<Operation>;
