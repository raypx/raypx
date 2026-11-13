import { expect, it } from "vitest";
import { routineStartContext } from "./runner.js";
import { approvalDisposition, type ApprovalCall } from "./approvals.js";

it("annotates at the fifteen-minute boundary using the routine timezone", () => {
  const due = "2026-11-14T00:00:00.000Z";
  expect(routineStartContext(due, "2026-11-14T00:14:59.999Z", "Asia/Shanghai").annotation).toBe("");
  const context = routineStartContext(due, "2026-11-14T00:15:00.000Z", "Asia/Shanghai");
  expect(context.annotation).toContain("08:00:00");
  expect(context.annotation).toContain("08:15:00");
  expect(context.dueAt).toBe(due);
});
it.each(["ask", "auto", "never"] as const)(
  "enforces untrusted writes in %s including future Auto review",
  (mode) => {
    const call: ApprovalCall = {
      id: "tool",
      name: "agent_memory_save",
      arguments: {},
      argumentSummary: "Save memory",
      target: "Agent memory",
      changes: true,
    };
    expect(
      approvalDisposition(
        { mode, rules: [{ toolName: call.name, executable: null, decision: "allow" }] },
        call,
        true,
      ),
    ).toBe(mode === "never" ? "approved" : "ask");
    expect(
      approvalDisposition(
        { mode, rules: [{ toolName: call.name, executable: null, decision: "block" }] },
        call,
        true,
      ),
    ).toBe("blocked");
  },
);
