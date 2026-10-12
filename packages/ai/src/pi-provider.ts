import { join } from "node:path";
import type { AgentSession, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { AiProvider, AiRunEvent, AiSession } from "./index.js";
import { normalizePiEvent, settledResult, type AssistantResult } from "./pi-events.js";

export interface PiProviderOptions {
  cwd?: string;
  agentDir?: string;
  sessionDirectory?: string;
  requireModel?: boolean;
  /** Runs before the actual tool, including read tools; rejection prevents execution. */
  guardTool?: (input: {
    name: string;
    arguments: unknown;
    callId: string;
    signal: AbortSignal | undefined;
  }) => Promise<void>;
}

type StoredSession = {
  session: Pick<AgentSession, "prompt" | "subscribe" | "dispose" | "abort" | "steer">;
  provider: AiSession;
};

export function createPiProvider(options: PiProviderOptions = {}): AiProvider {
  const sessions = new Map<string, StoredSession>();
  return {
    async createSession(input) {
      const sdk = await import("@earendil-works/pi-coding-agent");
      if (options.requireModel && !input.model)
        throw new Error("Pi provider/model is not configured.");
      const cwd = input.cwd ?? options.cwd;
      const modelRuntime = await sdk.ModelRuntime.create({
        allowModelNetwork: false,
        ...(options.agentDir
          ? {
              authPath: join(options.agentDir, "auth.json"),
              modelsPath: join(options.agentDir, "models.json"),
            }
          : {}),
      });
      const selectedModel = input.model
        ? modelRuntime.getModel(input.model.provider, input.model.id)
        : undefined;
      if (input.model && !selectedModel) throw new Error("Configured Pi model is unavailable.");
      if (input.model && !(await modelRuntime.getAuth(input.model.provider)))
        throw new Error("Configured Pi provider credentials are unavailable.");
      const sessionManager = input.sessionFile
        ? sdk.SessionManager.open(input.sessionFile, options.sessionDirectory, cwd)
        : options.sessionDirectory && cwd
          ? sdk.SessionManager.create(cwd, options.sessionDirectory)
          : undefined;
      const customTools: ToolDefinition[] = [];
      if (options.guardTool) {
        if (!cwd) throw new Error("An authorized project directory is required.");
        const factories: Record<string, (path: string) => unknown> = {
          read: sdk.createReadToolDefinition,
          write: sdk.createWriteToolDefinition,
          edit: sdk.createEditToolDefinition,
          ls: sdk.createLsToolDefinition,
          bash: sdk.createBashToolDefinition,
        };
        for (const name of input.tools ?? []) {
          const factory = factories[name];
          if (!factory)
            throw new Error(`Tool is not supported by the authorized local runner: ${name}`);
          // SDK tool schemas are invariant; the schema still validates before execute.
          const definition = factory(cwd) as ToolDefinition;
          const execute = definition.execute.bind(definition);
          customTools.push({
            ...definition,
            async execute(callId, args, signal, update, context) {
              await options.guardTool!({ name, arguments: args, callId, signal });
              return execute(callId, args, signal, update, context);
            },
          });
        }
      }
      const resourceLoader =
        options.guardTool && cwd && options.agentDir
          ? new sdk.DefaultResourceLoader({
              cwd,
              agentDir: options.agentDir,
              noExtensions: true,
              noSkills: true,
              noPromptTemplates: true,
              noThemes: true,
              noContextFiles: true,
            })
          : undefined;
      if (resourceLoader) await resourceLoader.reload();
      const result = await sdk.createAgentSession({
        modelRuntime,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(cwd ? { cwd } : {}),
        ...(options.agentDir ? { agentDir: options.agentDir } : {}),
        ...(sessionManager ? { sessionManager } : {}),
        ...(resourceLoader ? { resourceLoader } : {}),
        ...(customTools.length ? { customTools } : {}),
        ...(input.tools?.length ? { tools: input.tools } : { noTools: "all" as const }),
        ...(input.thinkingLevel ? { thinkingLevel: input.thinkingLevel } : {}),
      });
      const sessionFile = sessionManager?.getSessionFile();
      const provider: AiSession = {
        id: `pis_${crypto.randomUUID()}`,
        providerSessionId: result.session.sessionId,
        projectId: input.projectId,
        ...(cwd ? { cwd } : {}),
        ...(sessionFile ? { sessionFile } : {}),
        ...(input.role?.id ? { roleId: input.role.id } : {}),
        ...(input.role?.instructions ? { roleInstructions: input.role.instructions } : {}),
      };
      sessions.set(provider.id, { session: result.session, provider });
      return provider;
    },
    async *run(input) {
      const stored = sessions.get(input.session.id);
      if (!stored) {
        yield { type: "failed", message: "AI session not found." };
        return;
      }
      const events: AiRunEvent[] = [];
      let finished = false;
      let rejected = false;
      let assistant: AssistantResult | undefined;
      let wake = () => {};
      const unsubscribe = stored.session.subscribe((event) => {
        const mapped = normalizePiEvent(event);
        if (mapped?.type === "message_completed") assistant = mapped;
        if (mapped) events.push(mapped);
        // agent_end may be followed by auto retry/compaction; only settled is terminal.
        if (event.type === "agent_settled") finished = true;
        wake();
      });
      const onAbort = () => wake();
      input.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        if (!input.signal?.aborted) {
          const role = stored.provider;
          const prefix = role.roleId
            ? `[Agent role: ${role.roleId}]${role.roleInstructions ? `\n${role.roleInstructions}` : ""}\n`
            : "";
          void Promise.resolve()
            .then(() => stored.session.prompt(prefix + input.prompt))
            .catch((error: unknown) => {
              rejected = true;
              events.push({
                type: "failed",
                message: error instanceof Error ? error.message : "AI run failed.",
              });
            })
            .finally(() => {
              finished = true;
              wake();
            });
        }
        while (!finished || events.length) {
          if (input.signal?.aborted) {
            await stored.session.abort();
            yield { type: "cancelled" };
            return;
          }
          if (events.length) yield events.shift()!;
          else
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
        }
        if (!rejected) yield settledResult(assistant);
      } finally {
        unsubscribe();
        input.signal?.removeEventListener("abort", onAbort);
      }
    },
    async cancel(id) {
      await sessions.get(id)?.session.abort();
    },
    async disposeSession(id) {
      sessions.get(id)?.session.dispose();
      sessions.delete(id);
    },
    async steer(id, prompt) {
      const stored = sessions.get(id);
      if (!stored) throw new Error("AI session not found.");
      await stored.session.steer(prompt);
    },
    async getSession(id) {
      return sessions.get(id)?.provider ?? null;
    },
  };
}
