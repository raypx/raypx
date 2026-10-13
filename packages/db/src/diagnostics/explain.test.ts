import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { explainDatabaseQuery } from "./explain.js";
import { DatabaseDiagnosticError } from "./types.js";

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  const end = vi.fn();
  const transaction = vi.fn(async (run: (tx: { execute: typeof execute }) => Promise<unknown>) =>
    run({ execute }),
  );
  const client = { end };
  return {
    execute,
    end,
    transaction,
    client,
    postgres: vi.fn(() => client),
    drizzle: vi.fn(() => ({ transaction })),
  };
});
vi.mock("postgres", () => ({ default: mocks.postgres }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: mocks.drizzle }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.end.mockResolvedValue(undefined);
  mocks.execute.mockReset();
  mocks.execute.mockResolvedValueOnce([]).mockResolvedValueOnce([
    {
      "QUERY PLAN": [{ Plan: { "Node Type": "Limit", "Total Cost": 1, "Plan Rows": 0 } }],
    },
  ]);
});

describe("dedicated diagnostic execution", () => {
  it("sets transaction-local timeouts on a read-only dedicated connection before explaining", async () => {
    const result = await explainDatabaseQuery("postgres://private-url", {
      query: "queued-runs",
      statementTimeoutMs: 250,
      lockTimeoutMs: 20,
    });
    expect(result.nodes).toHaveLength(1);
    expect(mocks.postgres).toHaveBeenCalledWith("postgres://private-url", {
      max: 1,
      connect_timeout: 5,
      prepare: false,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      accessMode: "read only",
    });
    const dialect = new PgDialect();
    const settings = dialect.sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(settings.sql).toContain("set_config('statement_timeout', $1, true)");
    expect(settings.sql).toContain("set_config('lock_timeout', $2, true)");
    expect(settings.params).toEqual(["250ms", "20ms"]);
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[1]![0]).sql).toMatch(
      /^EXPLAIN \(FORMAT JSON\)/,
    );
    expect(mocks.end).toHaveBeenCalledWith({ timeout: 1 });
  });

  it("rejects invalid options before opening a connection", async () => {
    await expect(
      explainDatabaseQuery("postgres://private-url", { query: "queued-runs", buffers: true }),
    ).rejects.toEqual(new DatabaseDiagnosticError("INVALID_REQUEST"));
    expect(mocks.postgres).not.toHaveBeenCalled();
  });

  it.each(["57014", "55P03", "XX000"])(
    "removes driver SQL, parameters and URL from failures while closing the client: %s",
    async (code) => {
      mocks.execute.mockReset();
      mocks.execute.mockResolvedValueOnce([]).mockRejectedValueOnce(
        Object.assign(new Error("query contains private-credential"), {
          query: "select secret",
          params: ["private-credential"],
          cause: { code, message: "private-credential" },
        }),
      );
      let failure: unknown;
      try {
        await explainDatabaseQuery("postgres://private-credential", { query: "queued-runs" });
      } catch (error) {
        failure = error;
      }
      expect(failure).toEqual(
        new DatabaseDiagnosticError(code === "XX000" ? "QUERY_FAILED" : "QUERY_TIMEOUT"),
      );
      expect(failure).not.toHaveProperty("cause");
      expect(String(failure)).not.toContain("private-credential");
      expect(JSON.stringify(failure)).not.toContain("private-credential");
      expect(mocks.end).toHaveBeenCalledWith({ timeout: 1 });
    },
  );
});
