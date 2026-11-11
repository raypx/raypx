import { describe, expect, it } from "vite-plus/test";
import { AgentRunProjectionError, projectTaskStatusToRunStatus } from "./agent-runs.js";

describe("Agent Task status projection", () => {
  it.each([
    ["pending", "queued"],
    ["running", "running"],
    ["cancelling", "cancelling"],
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["delivery_failed", "failed"],
    ["cancelled", "cancelled"],
    ["interrupted", "interrupted"],
  ] as const)("projects %s to %s", (status, expected) => {
    expect(projectTaskStatusToRunStatus({ status })).toBe(expected);
  });

  it.each([
    ["permission", "waiting_approval"],
    ["plan", "waiting_approval"],
    ["question", "waiting_input"],
  ] as const)("projects a waiting task with a %s request to %s", (kind, expected) => {
    expect(projectTaskStatusToRunStatus({ status: "waiting" }, kind)).toBe(expected);
  });

  it("requires request context to distinguish approval from input", () => {
    expect(() => projectTaskStatusToRunStatus({ status: "waiting" })).toThrow(
      AgentRunProjectionError,
    );
  });
});
