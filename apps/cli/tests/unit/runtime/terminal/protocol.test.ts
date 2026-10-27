import { expect, it } from "vite-plus/test";
import {
  hookDecision,
  parseHookInvocation,
  terminalCapabilities,
} from "../../../../src/runtime/terminal/protocol";

const permission = {
  hook_event_name: "PermissionRequest",
  session_id: "synthetic-session",
  cwd: "/synthetic/project",
  tool_name: "Bash",
  tool_input: { command: "printf synthetic" },
};
it.each(["claude", "codex"] as const)(
  "maps %s permission decisions without vendor-specific extras",
  (provider) => {
    const invocation = parseHookInvocation(provider, permission)!;
    expect(invocation.kind).toBe("permission");
    expect(hookDecision(invocation, { type: "allow" })).toEqual({
      hookSpecificOutput: { hookEventName: "PermissionRequest", decision: { behavior: "allow" } },
    });
    expect(hookDecision(invocation, { type: "deny", note: "Keep the build" })).toEqual({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision: { behavior: "deny", message: "Keep the build" },
      },
    });
    expect(hookDecision(invocation, { type: "answer", answers: {} })).toBeUndefined();
  },
);
it("limits the Codex hook path to its actual permission tools", () => {
  expect(parseHookInvocation("codex", permission)).toBeDefined();
  for (const tool_name of ["apply_patch", "mcp__test__inspect"])
    expect(parseHookInvocation("codex", { ...permission, tool_name })).toBeUndefined();
  for (const tool_name of ["AskUserQuestion", "ExitPlanMode", "update_plan"])
    expect(parseHookInvocation("codex", { ...permission, tool_name })).toBeUndefined();
  expect(terminalCapabilities("codex")).toEqual({
    permission: true,
    permissionTools: ["Bash"],
    question: false,
    plan: false,
    simultaneousAnswers: false,
    requiresHookTrust: true,
  });
});
it("preserves Claude question input and returns answers using question text", () => {
  const value = {
    ...permission,
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: {
      questions: [
        {
          question: "Where?",
          multiSelect: true,
          options: [{ label: "Here", description: "This project" }, { label: "There" }],
        },
      ],
    },
  };
  const invocation = parseHookInvocation(
    "claude",
    value,
    terminalCapabilities("claude", { question: true }),
  )!;
  expect(invocation.questions[0]?.options[1]?.description).toBe("");
  expect(hookDecision(invocation, { type: "answer", answers: { "0": ["Here", "There"] } })).toEqual(
    {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...value.tool_input, answers: { "Where?": "Here, There" } },
      },
    },
  );
});
it("rejects unsupported, malformed and oversized hook payloads rather than approving clipped input", () => {
  expect(
    parseHookInvocation("codex", { ...permission, hook_event_name: "PostToolUse" }),
  ).toBeUndefined();
  expect(parseHookInvocation("claude", { ...permission, session_id: "" })).toBeUndefined();
  expect(
    parseHookInvocation("claude", { ...permission, tool_input: { command: "x".repeat(128_001) } }),
  ).toBeUndefined();
  expect(
    parseHookInvocation("claude", {
      ...permission,
      hook_event_name: "PreToolUse",
      tool_name: "ExitPlanMode",
      tool_input: {},
    }),
  ).toBeUndefined();
});
