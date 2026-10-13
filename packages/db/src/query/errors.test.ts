import { DrizzleQueryError } from "drizzle-orm";
import { describe, expect, it } from "vite-plus/test";
import { isUniqueViolation } from "./errors.js";

const constraint = "cloud_runs_active_task_idx";

describe("PostgreSQL unique violations", () => {
  it.each(["constraint_name", "constraint"])("reads exact %s metadata", (field) => {
    expect(isUniqueViolation({ code: "23505", [field]: constraint }, constraint)).toBe(true);
    expect(isUniqueViolation({ code: "23505", [field]: "other_constraint" }, constraint)).toBe(
      false,
    );
  });

  it("unwraps Drizzle query and transaction causes without reading query data", () => {
    const driver = Object.assign(new Error("duplicate key"), {
      code: "23505",
      constraint_name: constraint,
    });
    const query = new DrizzleQueryError("INSERT INTO cloud_runs", [], driver);
    const transaction = new Error("transaction failed", { cause: query });
    expect(isUniqueViolation(transaction, constraint)).toBe(true);
  });

  it.each([
    null,
    undefined,
    "23505",
    { code: 23505, constraint_name: constraint },
    { code: "23503", constraint_name: constraint },
    { code: "23505" },
    { constraint_name: constraint },
    { message: `duplicate key violates unique constraint "${constraint}"` },
    { code: "23505", message: `duplicate key violates unique constraint "${constraint}"` },
  ])("does not infer unique violations from incomplete metadata: %j", (error) => {
    expect(isUniqueViolation(error, constraint)).toBe(false);
  });

  it("requires SQLSTATE and constraint on the same error", () => {
    expect(
      isUniqueViolation({ code: "23505", cause: { constraint_name: constraint } }, constraint),
    ).toBe(false);
    expect(
      isUniqueViolation(
        { code: "23505", constraint_name: "other_constraint", constraint },
        constraint,
      ),
    ).toBe(false);
  });

  it("terminates cyclic causes and still recognizes a violation before the cycle", () => {
    const outer: { cause?: unknown } = {};
    const inner = { cause: outer };
    outer.cause = inner;
    expect(isUniqueViolation(outer, constraint)).toBe(false);
    Object.assign(inner, { code: "23505", constraint_name: constraint });
    expect(isUniqueViolation(outer, constraint)).toBe(true);
  });
});
