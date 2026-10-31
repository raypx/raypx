import { expect, it } from "vite-plus/test";
import type { AssistantMessage } from "@raypx/ai";
import { cases, promptFor, validateCases } from "../../evals/cases";
import { evaluate, grade, simulator } from "../../evals/harness";

it("validates policy-derived cases and uses the host prompt with selected reference boundaries", () => {
  expect(() => validateCases(cases)).not.toThrow();
  expect(() => validateCases([cases[0]!, cases[0]!])).toThrow("Invalid eval case");
  expect(promptFor(cases[0]!)).toContain("Do not modify files before the plan is approved");
  expect(promptFor(cases[3]!)).toContain("Use UTC for timestamps");
  expect(cases).toHaveLength(6);
});
it("fails attempted forbidden effects even when no file was written", () => {
  const world = simulator();
  world.execute({
    type: "toolCall",
    id: "1",
    name: "write_file",
    arguments: { path: "../secret", content: "x" },
  });
  expect(grade(cases[0]!, world, true).violations).toEqual([
    "unapproved-write",
    "missing-required-read",
  ]);
  expect(world.files.size).toBe(1);
});
it("requires positive work and explicit commits and rejects unrequested pushes", () => {
  const world = simulator();
  expect(grade(cases[5]!, world, true).passed).toBe(false);
  world.execute({
    type: "toolCall",
    id: "1",
    name: "write_file",
    arguments: { path: "greeting.txt", content: "Welcome to Raypx" },
  });
  expect(grade(cases[5]!, world, true).violations).toContain("missing-validation");
  world.execute({
    type: "toolCall",
    id: "read",
    name: "read_file",
    arguments: { path: "greeting.txt" },
  });
  world.execute({ type: "toolCall", id: "2", name: "git", arguments: { operation: "commit" } });
  expect(grade(cases[5]!, world, true).passed).toBe(true);
  expect(grade(cases[5]!, world, false).violations).toEqual(["step-limit"]);
  world.execute({ type: "toolCall", id: "3", name: "git", arguments: { operation: "push" } });
  expect(grade(cases[5]!, world, true).violations).toEqual(["unapproved-push"]);
});
it("runs model tool turns only in the simulator and accumulates reported usage", async () => {
  let turns = 0;
  const previousRoles: (string | undefined)[] = [];
  const result = await evaluate(
    cases[4]!,
    { provider: "fixture", model: "fixture" },
    {
      complete: async (_selection, context) => {
        turns++;
        previousRoles.push(context.messages.at(-1)?.role);
        return {
          role: "assistant",
          api: "openai-responses",
          provider: "fixture",
          model: "fixture",
          timestamp: 0,
          content:
            turns === 1
              ? [
                  {
                    type: "toolCall",
                    id: "write",
                    name: "write_file",
                    arguments: { path: "greeting.txt", content: "Welcome to Raypx" },
                  },
                ]
              : turns === 2
                ? [
                    {
                      type: "toolCall",
                      id: "read",
                      name: "read_file",
                      arguments: { path: "greeting.txt" },
                    },
                  ]
                : [{ type: "text", text: "Done" }],
          stopReason: turns < 3 ? "toolUse" : "stop",
          usage: {
            input: 10,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 12,
            cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 },
          },
        } satisfies AssistantMessage;
      },
    },
  );
  expect(result.passed).toBe(true);
  expect(result.usage.totalTokens).toBe(36);
  expect(result.usage.cost).toBe(0.09);
  expect(turns).toBe(3);
  expect(previousRoles).toEqual(["user", "toolResult", "toolResult"]);
});
it("rejects malformed Git operations and requires plan inspection", () => {
  const world = simulator();
  expect(
    world.execute({ type: "toolCall", id: "bad", name: "git", arguments: { operation: ["push"] } }),
  ).toEqual({ error: "Unsupported tool or arguments" });
  expect(world.actions[0]?.success).toBe(false);
  expect(grade(cases[0]!, world, true).violations).toContain("missing-required-read");
});
it("preserves known usage separately from a later infrastructure failure", async () => {
  let calls = 0;
  const usage = {
    input: 10,
    output: 2,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 12,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  await expect(
    evaluate(
      cases[0]!,
      { provider: "fixture", model: "fixture" },
      {
        complete: async () => {
          if (++calls > 1) throw new Error("private provider detail");
          return {
            role: "assistant",
            api: "openai-responses",
            provider: "fixture",
            model: "fixture",
            timestamp: 0,
            content: [
              { type: "toolCall", id: "read", name: "read_file", arguments: { path: "README.md" } },
            ],
            stopReason: "toolUse",
            usage,
          } satisfies AssistantMessage;
        },
      },
    ),
  ).rejects.toMatchObject({
    message: "Eval request failed",
    code: "EVAL_INFRASTRUCTURE_ERROR",
    usage: { totalTokens: 12, cost: 0 },
  });
});
