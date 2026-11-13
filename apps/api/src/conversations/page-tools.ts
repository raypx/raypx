import { ComputerToolsError, StaleRunFenceError, type ComputerTools } from "@raypx/agents/server";
import { PageError } from "@raypx/core/pages";
import {
  createPageTools,
  PageExecutionFenceError,
  type PagesService,
  type PageToolCall,
} from "@raypx/pages/server";

export function withPageTools(
  computer: ComputerTools,
  service: PagesService,
  secrets: () => readonly string[],
): ComputerTools {
  const pages = createPageTools(service);
  function isPage(name: string) {
    return (
      name === "agent_page_create" || name === "agent_page_update" || name === "agent_page_read"
    );
  }
  function guarded(value: unknown, code: "SECRET_INPUT" | "SECRET_OUTPUT" = "SECRET_INPUT") {
    const values = secrets().filter(Boolean);
    function contains(candidate: unknown): boolean {
      if (typeof candidate === "string") return values.some((secret) => candidate.includes(secret));
      if (Array.isArray(candidate)) return candidate.some(contains);
      if (!candidate || typeof candidate !== "object") return false;
      return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
    }
    if (contains(value)) throw new ComputerToolsError(code);
  }
  return {
    ...computer,
    definitions: (run) => [...computer.definitions(run), ...pages.definitions()],
    prepare(call, run) {
      if (!isPage(call.name)) return computer.prepare(call, run);
      if (!call.id || call.id.length > 128 || call.id.includes("\0") || call.argumentsError)
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      guarded(call);
      try {
        return pages.prepare(call);
      } catch {
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      }
    },
    async execute(scope, run, call, signal) {
      if (!isPage(call.name)) return computer.execute(scope, run, call, signal);
      guarded(call);
      try {
        const result = await pages.execute(
          scope,
          {
            agentId: run.agentId,
            memberAccountId: run.memberAccountId,
            runId: run.id,
            execution: {
              conversationId: run.conversationId,
              ownerId: run.ownerId,
              fence: run.fence,
            },
          },
          call as PageToolCall,
          signal,
        );
        guarded(JSON.parse(result), "SECRET_OUTPUT");
        return result;
      } catch (error) {
        if (error instanceof PageExecutionFenceError) throw new StaleRunFenceError();
        if (!(error instanceof PageError)) throw error;
        return JSON.stringify({ untrusted: true, state: "failed", code: error.code });
      }
    },
  };
}
