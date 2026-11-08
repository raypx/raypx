import { z } from "zod";
import type { AgentTool } from "@raypx/providers/pi";
import type { AgentTask } from "@raypx/core/tasks";
import { localParams } from "@raypx/contracts/local";
import type { AskApproval } from "@raypx/providers/core";
import type { FileRuntime } from "../../files/index.ts";
import type { ProcessRuntime } from "../../process/index.ts";

const path = { path: z.string() };
const definitions = [
  {
    name: "files_list",
    description: "List a granted project directory. Paths are relative to the project.",
    parameters: z.object({
      ...path,
      offset: z.int().min(0).optional(),
      limit: z.int().min(1).max(500).optional(),
    }),
  },
  {
    name: "files_stat",
    description: "Inspect project path metadata and current version.",
    parameters: z.object(path),
  },
  {
    name: "files_read",
    description: "Read a UTF-8 project file and its version.",
    parameters: z.object(path),
  },
  {
    name: "files_write",
    description:
      "Write a project file after approval. Supply its current version or null for a new file.",
    parameters: z.object({
      ...path,
      text: z.string().max(1_048_576),
      version: z.string().nullable(),
    }),
  },
  {
    name: "files_mkdir",
    description: "Create a project directory after approval.",
    parameters: z.object(path),
  },
  {
    name: "files_move",
    description: "Move a project path after approval with its current version.",
    parameters: z.object({ ...path, to: z.string(), version: z.string() }),
  },
  {
    name: "files_delete",
    description:
      "Permanently delete a project path after explicit approval with its current version.",
    parameters: z.object({ ...path, version: z.string() }),
  },
  {
    name: "command_run",
    description:
      "Execute an absolute program with explicit arguments after approval. cwd is project-relative. Commands have the OS user's permissions.",
    parameters: z.object({
      executable: z.string(),
      args: z.array(z.string()),
      cwd: z.string(),
      timeoutMs: z.int().min(100).max(600_000).optional(),
    }),
  },
].map((tool) => ({ ...tool, parameters: z.toJSONSchema(tool.parameters) }));
const readOnly = new Set(["files_list", "files_stat", "files_read"]);
export function createPiTools(
  rootId: string,
  files: FileRuntime,
  processes: ProcessRuntime,
  ask: AskApproval,
) {
  const invoke = async (name: string, args: Record<string, unknown>, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    switch (name) {
      case "files_list": {
        const p = localParams["files.list"].parse({ ...args, rootId });
        return files.list(rootId, p.path, p.offset, p.limit);
      }
      case "files_stat": {
        const p = localParams["files.stat"].parse({ ...args, rootId });
        return files.stat(rootId, p.path);
      }
      case "files_read": {
        const p = localParams["files.read"].parse({ ...args, rootId });
        return files.read(rootId, p.path);
      }
      case "files_write": {
        const p = localParams["files.write"].parse({ ...args, rootId });
        return files.write(rootId, p.path, p.text, p.version);
      }
      case "files_mkdir": {
        const p = localParams["files.mkdir"].parse({ ...args, rootId });
        return files.mkdir(rootId, p.path);
      }
      case "files_move": {
        const p = localParams["files.move"].parse({ ...args, rootId });
        return files.move(rootId, p.path, p.to, p.version);
      }
      case "files_delete": {
        const p = localParams["files.delete"].parse({ ...args, rootId, confirmed: true });
        return files.delete(rootId, p.path, p.version);
      }
      case "command_run": {
        const cwd = await files.resolve(rootId, typeof args.cwd === "string" ? args.cwd : "");
        const p = localParams["tools.run"].parse({ ...args, cwd });
        if (p.timeoutMs > 600_000) throw new Error("PI_INVALID_INPUT");
        return processes.run(p, signal);
      }
      default:
        throw new Error("PI_TOOL_DENIED");
    }
  };
  return {
    tools: (mode: AgentTask["mode"]): AgentTool[] =>
      definitions
        .filter((entry) => mode === "run" || readOnly.has(entry.name))
        .map((entry) => ({
          ...entry,
          label: entry.name,
          execute: async (_id, args, signal) => {
            const result = await invoke(entry.name, args as Record<string, unknown>, signal);
            return { content: [{ type: "text", text: JSON.stringify(result) }], details: {} };
          },
        })),
    effectful: (name: string) => !readOnly.has(name),
    authorize: async (
      call: { name: string; arguments: unknown },
      signal: AbortSignal,
    ): Promise<"allow" | "deny"> => {
      if (signal.aborted || !definitions.some((entry) => entry.name === call.name)) return "deny";
      // Revalidate the grant both before approval and again inside the operation.
      await files.resolve(rootId, "");
      if (readOnly.has(call.name)) return "allow";
      const decision = await ask(
        "permission",
        call.name,
        JSON.stringify({ tool: call.name, arguments: call.arguments }, null, 2),
      );
      return !signal.aborted && decision.type === "allow" ? "allow" : "deny";
    },
  };
}
