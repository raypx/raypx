import { taskText } from "@raypx/core/task-text";
import type { HumanDecision, HumanRequest } from "@raypx/core/tasks";
import { object } from "../core/index.ts";

export interface ClaudeHookApprovalPort {
  markPlanHandled(): void;
  approveHookPlan(): void;
  ask(
    kind: HumanRequest["kind"],
    title: string,
    body: string,
    questions: HumanRequest["questions"],
  ): Promise<HumanDecision>;
}

const text = (value: unknown, max = 128_000) =>
  typeof value === "string" ? taskText(value, max) : "";

export async function respondToClaudeHook(
  input: Record<string, unknown>,
  execution: ClaudeHookApprovalPort,
): Promise<Response> {
  const name = text(input.tool_name, 500);
  const tool = object(input.tool_input);
  const question = name === "AskUserQuestion";
  const plan = name === "ExitPlanMode";
  if (plan) execution.markPlanHandled();
  const questions =
    question && Array.isArray(tool.questions)
      ? tool.questions.map((item: unknown, index: number) => {
          const q = object(item);
          return {
            id: String(index),
            text: text(q.question, 8000),
            multiSelect: q.multiSelect === true,
            options: Array.isArray(q.options)
              ? q.options.map((option: unknown) => ({
                  label: text(object(option).label, 1000),
                  description: text(object(option).description, 8000),
                }))
              : [],
          };
        })
      : [];
  const decision = await execution.ask(
    question ? "question" : plan ? "plan" : "permission",
    name,
    plan
      ? typeof tool.plan === "string"
        ? tool.plan
        : ""
      : question
        ? ""
        : JSON.stringify(tool, null, 2),
    questions,
  );
  if (plan && decision.type === "allow") execution.approveHookPlan();
  if (input.hook_event_name === "PermissionRequest")
    return Response.json({
      hookSpecificOutput: {
        hookEventName: "PermissionRequest",
        decision:
          decision.type === "allow"
            ? { behavior: "allow" }
            : {
                behavior: "deny",
                message: decision.type === "deny" ? decision.note : "Denied",
              },
      },
    });
  const updatedInput =
    question && decision.type === "answer"
      ? {
          ...tool,
          answers: Object.fromEntries(
            questions.map((q) => [q.text, (decision.answers[q.id] ?? []).join(", ")]),
          ),
        }
      : tool;
  return Response.json({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision.type === "deny" ? "deny" : "allow",
      permissionDecisionReason: decision.type === "deny" ? decision.note : "",
      updatedInput,
    },
  });
}
