import { normalizeTaskJson, type AgentProvider, type HumanDecision } from "@raypx/contracts/tasks";
import type { TerminalRequest, TerminalSession } from "@raypx/contracts/terminal";

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const bounded = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;

export type HookInvocation = {
  provider: AgentProvider;
  providerSessionId: string;
  cwd: string;
  event: "PermissionRequest" | "PreToolUse";
  tool: string;
  input: Record<string, unknown>;
  kind: TerminalRequest["kind"];
  body: string;
  questions: TerminalRequest["questions"];
};

export function terminalCapabilities(
  provider: AgentProvider,
  verified: { question?: boolean; plan?: boolean } = {},
): TerminalSession["capabilities"] {
  return {
    permission: true,
    permissionTools: ["Bash"],
    question: provider === "claude" && verified.question === true,
    plan: provider === "claude" && verified.plan === true,
    simultaneousAnswers: false,
    requiresHookTrust: provider === "codex",
  };
}

/** Vendor input stays local. Never normalize a tool argument before deciding it. */
export function parseHookInvocation(
  provider: AgentProvider,
  payload: unknown,
  capabilities = terminalCapabilities(provider),
): HookInvocation | undefined {
  const raw = object(payload);
  if (!raw || !bounded(raw.session_id, 500) || !bounded(raw.cwd, 4096)) return;
  if (!bounded(raw.tool_name, 500)) return;
  const input = object(raw.tool_input);
  if (!input) return;
  let encoded: string;
  try {
    encoded = JSON.stringify(input);
  } catch {
    return;
  }
  if (Buffer.byteLength(encoded) > 128 * 1024 || encoded.length > 128_000) return;
  const event = raw.hook_event_name;
  const question = provider === "claude" && raw.tool_name === "AskUserQuestion";
  const plan = provider === "claude" && raw.tool_name === "ExitPlanMode";
  if (event !== "PermissionRequest" && !(event === "PreToolUse" && (question || plan))) return;
  if (
    question
      ? !capabilities.question
      : plan
        ? !capabilities.plan
        : !capabilities.permission ||
          !capabilities.permissionTools.some(
            (tool) =>
              tool === raw.tool_name ||
              (tool === "MCP" && /^mcp__[^\s]+$/.test(String(raw.tool_name))),
          )
  )
    return;
  const questions: TerminalRequest["questions"] = [];
  if (question) {
    if (event !== "PreToolUse") return;
    if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 10)
      return;
    for (const [index, value] of input.questions.entries()) {
      const q = object(value);
      if (!q || !bounded(q.question, 8000) || !Array.isArray(q.options) || q.options.length > 20)
        return;
      if (
        questions.some((entry) => entry.text === q.question) ||
        (q.multiSelect !== undefined && typeof q.multiSelect !== "boolean")
      )
        return;
      const options = [];
      for (const optionValue of q.options) {
        const option = object(optionValue);
        if (!option || !bounded(option.label, 1000)) return;
        if (
          option.description !== undefined &&
          (typeof option.description !== "string" || option.description.length > 8000)
        )
          return;
        options.push({
          label: option.label,
          description: typeof option.description === "string" ? option.description : "",
        });
      }
      questions.push({
        id: String(index),
        text: q.question,
        multiSelect: q.multiSelect === true,
        options,
      });
    }
  }
  if (
    plan &&
    (event !== "PreToolUse" ||
      typeof input.plan !== "string" ||
      !input.plan.trim() ||
      input.plan.length > 128_000 ||
      normalizeTaskJson(input.plan) !== input.plan)
  )
    return;
  return {
    provider,
    providerSessionId: raw.session_id,
    cwd: raw.cwd,
    event,
    tool: raw.tool_name,
    input,
    kind: question ? "question" : plan ? "plan" : "permission",
    body: plan ? (input.plan as string) : question ? "" : JSON.stringify(input, null, 2),
    questions,
  };
}

/** Undefined means no decision: the calling hook exits successfully with no stdout. */
export function hookDecision(invocation: HookInvocation, decision: HumanDecision): unknown {
  if (invocation.kind === "question" && decision.type !== "answer" && decision.type !== "deny")
    return;
  if (invocation.kind !== "question" && decision.type === "answer") return;
  if (invocation.event === "PermissionRequest") {
    if (decision.type === "answer") return;
    return {
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision:
          decision.type === "allow"
            ? { behavior: "allow" }
            : { behavior: "deny", message: decision.note },
      },
    };
  }
  const updatedInput =
    decision.type === "answer"
      ? {
          ...invocation.input,
          answers: Object.fromEntries(
            invocation.questions.map((q) => [q.text, (decision.answers[q.id] ?? []).join(", ")]),
          ),
        }
      : invocation.input;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.type === "deny" ? "deny" : "allow",
      ...(decision.type === "deny"
        ? { permissionDecisionReason: decision.note }
        : { updatedInput }),
    },
  };
}
