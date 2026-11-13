import { expect, it } from "vitest";
import { toolCompletion } from "./tool-lifecycle.js";
import { computerToolResult } from "./computer-tools.js";

it("extracts only the stable outcome and command status from bounded tool results", () => {
  const output = computerToolResult(
    "failed",
    JSON.stringify({ stdout: "private-output", stderr: "private-error", exitStatus: 7 }),
  );
  expect(toolCompletion("call", output)).toEqual({
    toolCallId: "call",
    outcome: "failed",
    exitStatus: 7,
  });
  expect(JSON.stringify(toolCompletion("call", output))).not.toMatch(
    /private-output|private-error/,
  );
  for (const state of ["refused", "blocked", "denied", "expired"])
    expect(toolCompletion("call", JSON.stringify({ state })).outcome).toBe("refused");
  expect(toolCompletion("call", computerToolResult("cancelled", "private"))).toEqual({
    toolCallId: "call",
    outcome: "cancelled",
    exitStatus: null,
  });
  expect(toolCompletion("call", "invalid private data")).toEqual({
    toolCallId: "call",
    outcome: "unknown",
    exitStatus: null,
  });
});

it("retains the command exit status when its result body is truncated", () => {
  const output = computerToolResult(
    "failed",
    JSON.stringify({ stdout: "x".repeat(40_000), exitStatus: 9 }),
    true,
    9,
  );
  expect(toolCompletion("call", output)).toEqual({
    toolCallId: "call",
    outcome: "failed",
    exitStatus: 9,
  });
});
