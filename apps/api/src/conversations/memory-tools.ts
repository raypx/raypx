import { ComputerToolsError, StaleRunFenceError, type ComputerTools } from "@raypx/agents/server";
import { SpaceMemoryError } from "@raypx/core/space-memory";
import {
  createMemoryTools,
  MemoryExecutionFenceError,
  type SpaceMemoryService,
  type MemoryToolCall,
} from "@raypx/memory/space-server";

/** Memory uses the same change approval/effect pipeline as Computer actions. */
export function withMemoryTools(
  computer: ComputerTools,
  service: SpaceMemoryService,
  secrets: () => readonly string[],
): ComputerTools {
  const memory = createMemoryTools(service);
  function isMemory(name: string) {
    return name === "agent_memory_save" || name === "agent_memory_update";
  }
  function guarded(value: unknown, code: "SECRET_INPUT" | "SECRET_OUTPUT" = "SECRET_INPUT") {
    const protectedValues = secrets().filter(Boolean);
    function containsSecret(candidate: unknown): boolean {
      if (typeof candidate === "string")
        return protectedValues.some((secret) => candidate.includes(secret));
      if (Array.isArray(candidate)) return candidate.some(containsSecret);
      if (!candidate || typeof candidate !== "object") return false;
      return Object.entries(candidate).some(
        ([key, child]) => containsSecret(key) || containsSecret(child),
      );
    }
    if (containsSecret(value)) throw new ComputerToolsError(code);
  }
  return {
    ...computer,
    definitions: (run) => [...computer.definitions(run), ...memory.definitions()],
    prepare(call, run) {
      if (!isMemory(call.name)) return computer.prepare(call, run);
      if (!call.id || call.id.length > 128 || call.id.includes("\0") || call.argumentsError)
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      guarded(call);
      return memory.prepare(call);
    },
    async execute(scope, run, call, signal) {
      if (!isMemory(call.name)) return computer.execute(scope, run, call, signal);
      guarded(call);
      try {
        const result = await memory.execute(
          scope,
          {
            agentId: run.agentId,
            memberAccountId: run.memberAccountId,
            runId: run.id,
            untrustedInput: run.untrustedInput || Boolean(run.inboundProvenance),
            allowSharedMemory: run.allowSharedMemory ?? false,
            execution: {
              conversationId: run.conversationId,
              ownerId: run.ownerId,
              fence: run.fence,
            },
          },
          call as MemoryToolCall,
          signal,
        );
        guarded(JSON.parse(result), "SECRET_OUTPUT");
        return result;
      } catch (error) {
        if (error instanceof MemoryExecutionFenceError) throw new StaleRunFenceError();
        if (!(error instanceof SpaceMemoryError)) throw error;
        return JSON.stringify({ untrusted: true, state: "failed", code: error.code });
      }
    },
  };
}
