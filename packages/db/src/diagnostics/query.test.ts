import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vite-plus/test";
import { diagnosticStatement } from "./query.js";
import { DatabaseDiagnosticError, type ExplainDatabaseRequest } from "./types.js";

const dialect = new PgDialect();
const compile = (request: ExplainDatabaseRequest) =>
  dialect.sqlToQuery(diagnosticStatement(request).query);

describe("fixed diagnostic query catalog", () => {
  it("plans the queue without executing it unless analyze is explicit", () => {
    const planned = compile({ query: "queued-runs" });
    expect(planned.sql).toMatch(/^EXPLAIN \(FORMAT JSON\) SELECT data/);
    expect(planned.sql).toContain("WHERE status='queued' ORDER BY created_at,id LIMIT $1");
    expect(planned.params).toEqual([50]);
    expect(compile({ query: "queued-runs", analyze: true, buffers: true }).sql).toMatch(
      /^EXPLAIN \(FORMAT JSON, ANALYZE true, BUFFERS true\)/,
    );
  });

  it("binds expiry time and preserves the repository's NULL lease ordering", () => {
    const now = new Date("2026-10-13T00:00:00Z");
    const planned = compile({ query: "expired-runs", now, limit: 20 });
    expect(planned.sql).toContain("lease_expires_at IS NULL OR lease_expires_at<=$1");
    expect(planned.sql).toContain("ORDER BY lease_expires_at NULLS FIRST,id LIMIT $2");
    expect(planned.params).toEqual([now.toISOString(), 20]);
  });

  it("uses the real visibility predicate and binds actor IDs instead of interpolating them", () => {
    const actorId = "reader'; SELECT secret FROM users; --";
    const planned = compile({ query: "visible-projects", actorId, limit: 10 });
    expect(planned.sql).not.toContain(actorId);
    expect(planned.sql).toContain('"project_members_v2"');
    expect(planned.sql).toContain('"organization_members"');
    expect(planned.sql).toContain("date_trunc('milliseconds'");
    expect(planned.params).toEqual([actorId, actorId, actorId, actorId, 11]);
  });

  it("binds account and the same inclusive/exclusive accounting bounds", () => {
    const from = new Date("2026-10-01T00:00:00Z");
    const until = new Date("2026-11-01T00:00:00Z");
    const planned = compile({ query: "account-usage", accountId: "private-account", from, until });
    expect(planned.sql).not.toContain("private-account");
    expect(planned.sql).toMatch(/created_at >= \$\d+ AND created_at < \$\d+/);
    expect(planned.params).toEqual(
      expect.arrayContaining(["private-account", from.toISOString(), until.toISOString()]),
    );
    expect(planned.params.filter((value) => value === "private-account")).toHaveLength(3);
  });

  it.each([
    null,
    { query: "raw", sql: "delete from users" },
    { query: "toString" },
    { query: "queued-runs", sql: "select secret" },
    { query: "queued-runs", buffers: true },
    { query: "queued-runs", analyze: "yes" },
    { query: "queued-runs", limit: 0 },
    { query: "queued-runs", limit: 101 },
    { query: "queued-runs", limit: 1.5 },
    { query: "queued-runs", statementTimeoutMs: 30_001 },
    { query: "queued-runs", lockTimeoutMs: 0 },
    { query: "expired-runs", now: "2026-10-13" },
    { query: "expired-runs", now: new Date("invalid") },
    { query: "visible-projects", actorId: " " },
    {
      query: "account-usage",
      accountId: "a",
      from: new Date("2026-11-01"),
      until: new Date("2026-10-01"),
    },
  ])("rejects malformed or unrestricted requests before database access: %j", (request) => {
    expect(() => diagnosticStatement(request as ExplainDatabaseRequest)).toThrow(
      new DatabaseDiagnosticError("INVALID_REQUEST"),
    );
  });
});
