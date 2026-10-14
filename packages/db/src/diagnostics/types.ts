import type { PlanNode, PlanSummary } from "@voidmix/drizzle/diagnostics";

export type DatabaseDiagnosticQuery =
  | "queued-runs"
  | "expired-runs"
  | "account-usage"
  | "visible-projects";

export interface ExplainDatabaseOptions {
  analyze?: boolean;
  buffers?: boolean;
  statementTimeoutMs?: number;
  lockTimeoutMs?: number;
}

export type ExplainDatabaseRequest = ExplainDatabaseOptions &
  (
    | { query: "queued-runs"; limit?: number }
    | { query: "expired-runs"; now: Date; limit?: number }
    | { query: "account-usage"; accountId: string; from: Date; until: Date }
    | { query: "visible-projects"; actorId: string; limit?: number }
  );

export type DatabasePlanNode = PlanNode;

/** Application query identity accompanies a generic sanitized plan summary. */
export interface ExplainDatabaseResult extends PlanSummary {
  query: DatabaseDiagnosticQuery;
}

export class DatabaseDiagnosticError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "QUERY_TIMEOUT" | "QUERY_FAILED" | "INVALID_PLAN",
  ) {
    super(
      {
        INVALID_REQUEST: "Invalid database diagnostic request.",
        QUERY_TIMEOUT: "Database diagnostic query timed out.",
        QUERY_FAILED: "Database diagnostic query failed.",
        INVALID_PLAN: "Database returned an invalid diagnostic plan.",
      }[code],
    );
    this.name = "DatabaseDiagnosticError";
  }
}
