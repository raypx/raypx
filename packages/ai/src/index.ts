import type { ProjectV2, TaskStatusV2 } from "@voidmix/core";
import type { ProjectApplication } from "@voidmix/application";
export { createModelGateway } from "./model-gateway.js";
export type { ModelGatewayRequest, ModelGatewayTransport } from "./model-gateway.js";
export { searchWeb, readPublicSource, isPublicAddress, validateSourceUrl } from "./research.js";
export { createPiProvider } from "./pi-provider.js";
export type { PiProviderOptions } from "./pi-provider.js";
export {
  createCloudPiAgent,
  normalizeModelUsage,
  checkPiRuntime,
  CloudModelUnavailableError,
} from "./cloud-pi.js";
export type {
  CloudPiAgent,
  CloudPiOptions,
  CloudPiRunInput,
  TrustedAiTool,
  ModelCallHooks,
  ModelUsage,
} from "./cloud-pi.js";

export type AiRunEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "message_completed";
      text: string;
      stopReason: string;
      usage?: import("./cloud-pi.js").ModelUsage;
    }
  | { type: "thinking"; active: boolean }
  | { type: "tool_call"; callId: string; name: string; input: unknown }
  | { type: "tool_result"; callId: string; name: string; output: unknown; isError?: boolean }
  | { type: "completed"; text: string }
  | { type: "failed"; message: string }
  | { type: "cancelled" };

export interface AiSession {
  id: string;
  providerSessionId: string;
  projectId?: string;
  cwd?: string;
  roleId?: string;
  roleInstructions?: string;
  sessionFile?: string;
}

export interface AiRunInput {
  session: AiSession;
  project: Pick<ProjectV2, "id" | "title">;
  prompt: string;
  signal?: AbortSignal;
}

export interface AiToolRegistry {
  names(): string[];
  invoke(name: string, input: unknown): Promise<unknown>;
}

export interface AiSessionInput {
  projectId: string;
  title?: string;
  /** Project-local working directory. Caller must authorize access. */
  cwd?: string;
  role?: { id: string; instructions?: string };
  model?: { provider: string; id: string };
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  /** Explicit Pi tool allowlist. Omitted means no tools. */
  tools?: string[];
  /** Host-owned persisted Pi session; never supplied by the model. */
  sessionFile?: string;
}

export interface AiProvider {
  createSession(input: AiSessionInput): Promise<AiSession>;
  run(input: AiRunInput): AsyncIterable<AiRunEvent>;
  cancel(sessionId: string): Promise<void>;
  getSession(sessionId: string): Promise<AiSession | null>;
  disposeSession?(sessionId: string): Promise<void>;
  steer?(sessionId: string, prompt: string): Promise<void>;
}

export async function collectRun(provider: AiProvider, input: AiRunInput): Promise<AiRunEvent[]> {
  const events: AiRunEvent[] = [];
  for await (const event of provider.run(input)) events.push(event);
  return events;
}

export interface ProjectAgentToolDependencies {
  projects: Pick<ProjectApplication, "get" | "listTasks" | "createTask" | "updateTask">;
  actorId: string;
}

export function createProjectAgentTools(
  dependencies: ProjectAgentToolDependencies,
): AiToolRegistry {
  const tools = {
    get_project: async (input: unknown) => {
      const projectId = readString(input, "projectId");
      return (
        (await dependencies.projects.get({ projectId, actorId: dependencies.actorId }))?.project ??
        null
      );
    },
    list_tasks: async (input: unknown) => {
      const projectId = readString(input, "projectId");
      return dependencies.projects.listTasks({ projectId, actorId: dependencies.actorId });
    },
    create_task: async (input: unknown) => {
      const projectId = readString(input, "projectId");
      const title = readString(input, "title");
      return dependencies.projects.createTask({ projectId, title, actorId: dependencies.actorId });
    },
    update_task: async (input: unknown) => {
      const taskId = readString(input, "taskId");
      const status = readString(input, "status") as TaskStatusV2;
      return dependencies.projects.updateTask({ taskId, status, actorId: dependencies.actorId });
    },
  } satisfies Record<string, (input: unknown) => Promise<unknown>>;

  return {
    names: () => Object.keys(tools),
    invoke: async (name, input) => {
      const tool = tools[name as keyof typeof tools];
      if (!tool) throw new Error(`Unknown AI tool: ${name}`);
      return tool(input);
    },
  };
}

export function createFakeProvider(tools?: AiToolRegistry): AiProvider {
  const sessions = new Map<string, AiSession>();
  return {
    async createSession(input) {
      const session = {
        id: `pis_${crypto.randomUUID()}`,
        providerSessionId: `fake_${crypto.randomUUID()}`,
        projectId: input.projectId,
      };
      sessions.set(session.id, session);
      return session;
    },
    async *run(input) {
      if (input.signal?.aborted) {
        yield { type: "cancelled" };
        return;
      }
      yield { type: "thinking", active: true };
      yield { type: "text_delta", text: `Prepared next steps for ${input.project.title}.` };
      if (tools)
        yield { type: "tool_result", callId: "fake", name: "list_tasks", output: tools.names() };
      yield { type: "thinking", active: false };
      yield { type: "completed", text: `Prepared next steps for ${input.project.title}.` };
    },
    async cancel(sessionId) {
      sessions.delete(sessionId);
    },
    async getSession(sessionId) {
      return sessions.get(sessionId) ?? null;
    },
  };
}

function readString(input: unknown, key: string): string {
  if (typeof input !== "object" || input === null || !(key in input)) {
    throw new Error(`Missing AI tool input: ${key}`);
  }
  const value = (input as Record<string, unknown>)[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`Invalid AI tool input: ${key}`);
  return value;
}
