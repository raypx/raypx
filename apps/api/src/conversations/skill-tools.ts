import { ComputerToolsError, StaleRunFenceError, type ComputerTools } from "@raypx/agents/server";
import { SkillError } from "@raypx/core/skills";
import {
  createSkillTools,
  SkillExecutionFenceError,
  type SkillsService,
  type SkillToolCall,
} from "@raypx/skills/server";

export function withSkillTools(
  computer: ComputerTools,
  service: SkillsService,
  secrets: () => readonly string[],
): ComputerTools {
  const skills = createSkillTools(service);
  function own(name: string) {
    return name === "agent_skill_load" || name === "agent_skill_save";
  }
  function guard(value: unknown, code: "SECRET_INPUT" | "SECRET_OUTPUT" = "SECRET_INPUT") {
    const protectedValues = secrets().filter(Boolean);
    function contains(candidate: unknown): boolean {
      if (typeof candidate === "string")
        return protectedValues.some((secret) => candidate.includes(secret));
      if (Array.isArray(candidate)) return candidate.some(contains);
      if (!candidate || typeof candidate !== "object") return false;
      return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
    }
    if (contains(value)) throw new ComputerToolsError(code);
  }
  return {
    ...computer,
    definitions: (run) => [...computer.definitions(run), ...skills.definitions()],
    prepare(call, run) {
      if (!own(call.name)) return computer.prepare(call, run);
      if (call.argumentsError) throw new ComputerToolsError("INVALID_ARGUMENTS");
      guard(call);
      try {
        return skills.prepare(call);
      } catch {
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      }
    },
    async execute(scope, run, call, signal) {
      if (!own(call.name)) return computer.execute(scope, run, call, signal);
      guard(call);
      try {
        const result = await skills.execute(
          scope,
          {
            agentId: run.agentId,
            runId: run.id,
            memberAccountId: run.memberAccountId,
            execution: {
              conversationId: run.conversationId,
              ownerId: run.ownerId,
              fence: run.fence,
            },
          },
          call as SkillToolCall,
          signal,
        );
        guard(JSON.parse(result), "SECRET_OUTPUT");
        return result;
      } catch (error) {
        if (error instanceof SkillExecutionFenceError) throw new StaleRunFenceError();
        if (!(error instanceof SkillError)) throw error;
        return JSON.stringify({ untrusted: true, state: "failed", code: error.code });
      }
    },
  };
}
