import postgres, { type Sql } from "postgres";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { diagnosticStatement } from "./query.js";
import { summarizePlan, DrizzleDiagnosticError } from "@voidmix/drizzle/diagnostics";
import {
  DatabaseDiagnosticError,
  type ExplainDatabaseRequest,
  type ExplainDatabaseResult,
} from "./types.js";

function queryTimedOut(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (value.code === "57014" || value.code === "55P03") return true;
    current = value.cause;
  }
  return false;
}

/** Use a dedicated connection so a canceled diagnostic never retains an app lease. */
export async function explainDatabaseQuery(
  databaseUrl: string,
  request: ExplainDatabaseRequest,
): Promise<ExplainDatabaseResult> {
  const statement = diagnosticStatement(request);
  let client: Sql | undefined;
  try {
    client = postgres(databaseUrl, { max: 1, connect_timeout: 5, prepare: false });
    const db = drizzle({ client });
    return await db.transaction(
      async (tx) => {
        // PostgreSQL owns cancellation. Local settings disappear on commit/rollback.
        await tx.execute(sql`SELECT
          set_config('statement_timeout', ${`${statement.statementTimeoutMs}ms`}, true),
          set_config('lock_timeout', ${`${statement.lockTimeoutMs}ms`}, true)`);
        const rows = await tx.execute<{ "QUERY PLAN": unknown }>(statement.query);
        return {
          query: request.query,
          ...summarizePlan(rows[0]?.["QUERY PLAN"], {
            analyze: statement.analyze,
            buffers: statement.buffers,
          }),
        };
      },
      { accessMode: "read only" },
    );
  } catch (error) {
    if (error instanceof DatabaseDiagnosticError) throw error;
    if (error instanceof DrizzleDiagnosticError) throw new DatabaseDiagnosticError("INVALID_PLAN");
    throw new DatabaseDiagnosticError(queryTimedOut(error) ? "QUERY_TIMEOUT" : "QUERY_FAILED");
  } finally {
    // end() has its own bounded connection teardown and does not expose driver errors.
    await client?.end({ timeout: 1 }).catch(() => {});
  }
}
