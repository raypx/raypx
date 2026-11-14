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

it("retains only valid identities returned by successful built-in Page writes", () => {
  const result = JSON.stringify({ state: "succeeded", pageId: "server-page", version: 3 });
  for (const name of ["agent_page_create", "agent_page_update"])
    expect(toolCompletion("call", result, "unknown", name)).toEqual({
      toolCallId: "call",
      outcome: "succeeded",
      exitStatus: null,
      page: { id: "server-page", version: 3 },
    });
  for (const name of [undefined, "agent_page_read", "computer_read_file", "mcp_server__page"])
    expect(toolCompletion("call", result, "unknown", name)).not.toHaveProperty("page");
  for (const output of [
    { state: "failed", pageId: "page", version: 1 },
    { state: "succeeded", pageId: "page", version: 0 },
    { state: "succeeded", pageId: "page", version: 1.5 },
    { state: "succeeded", pageId: "", version: 1 },
    { state: "succeeded", arguments: { pageId: "forged", version: 99 } },
  ])
    expect(
      toolCompletion("call", JSON.stringify(output), "unknown", "agent_page_update"),
    ).not.toHaveProperty("page");
});
