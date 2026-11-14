import { protectedInputSpecSchema, protectedHeaderSchema } from "@raypx/core/protected-input";
import type { Tool, ToolCall } from "@raypx/ai";
import {
  ComputerToolsError,
  type ComputerTools,
  type ExecutionRun,
  type PreparedComputerCall,
} from "@raypx/agents/server";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { z } from "zod";
import { McpTransportError } from "@raypx/providers/mcp";
import { McpServerError, type McpServersService } from "./mcp-servers.js";

const savedTool = z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
  description: z.string().max(4000),
  inputSchema: z
    .record(z.string(), z.unknown())
    .refine((schema) => schema.type === "object" && JSON.stringify(schema).length <= 16384),
  readOnly: z.boolean(),
});
const catalogSchema = z
  .array(
    z.strictObject({
      serverId: z.string().uuid(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      tools: z.array(savedTool).max(128),
      perCallSecretHeader: protectedHeaderSchema.nullable().optional(),
    }),
  )
  .max(32)
  .refine(
    (catalog) =>
      catalog.reduce((count, server) => count + server.tools.length, 0) <= 128 &&
      Buffer.byteLength(JSON.stringify(catalog), "utf8") <= 262144,
  );
type Catalog = z.infer<typeof catalogSchema>;
interface Binding {
  serverId: string;
  fingerprint: string;
  remoteName: string;
  perCallSecretHeader?: string | null;
  readOnly: boolean;
  definition: Tool;
}
export function mcpToolName(serverId: string, remoteName: string): string {
  return `mcp_${serverId.replaceAll("-", "")}__${remoteName}`;
}
/** All MCP calls stay effects, including annotated reads, so completed calls replay once. */
export function withMcpTools(
  base: ComputerTools,
  service: McpServersService,
  protectedValues: () => readonly string[] = () => [],
): ComputerTools {
  const catalogs = new Map<string, Catalog>();
  const bindings = new Map<string, Map<string, Binding>>();
  function guard(value: unknown, code: "SECRET_INPUT" | "SECRET_OUTPUT") {
    const values = [...protectedValues(), ...service.protectedValues()].filter(Boolean);
    function contains(candidate: unknown): boolean {
      if (typeof candidate === "string") return values.some((secret) => candidate.includes(secret));
      if (Array.isArray(candidate)) return candidate.some(contains);
      if (!candidate || typeof candidate !== "object") return false;
      return Object.entries(candidate).some(([key, child]) => contains(key) || contains(child));
    }
    if (contains(value)) throw new ComputerToolsError(code);
  }
  function bind(runId: string, catalog: Catalog) {
    const map = new Map<string, Binding>();
    for (const server of catalog)
      for (const tool of server.tools) {
        const name = mcpToolName(server.serverId, tool.name);
        map.set(name, {
          serverId: server.serverId,
          fingerprint: server.fingerprint,
          remoteName: tool.name,
          perCallSecretHeader: server.perCallSecretHeader ?? null,
          readOnly: tool.readOnly,
          definition: {
            name,
            description: `${tool.description}${server.perCallSecretHeader ? " Request protectedInput for the declared single-call secret header; never include its value in chat or arguments." : ""}`,
            parameters: server.perCallSecretHeader
              ? {
                  ...tool.inputSchema,
                  properties: {
                    ...(tool.inputSchema.properties as object),
                    protectedInput: z.toJSONSchema(
                      protectedInputSpecSchema.extend({
                        destination: z.strictObject({
                          kind: z.literal("mcp-header"),
                          name: z.literal(server.perCallSecretHeader),
                        }),
                      }),
                    ),
                  },
                }
              : tool.inputSchema,
          },
        });
      }
    bindings.set(runId, map);
  }
  function find(name: string): Binding | undefined {
    for (const map of bindings.values()) {
      const binding = map.get(name);
      if (binding) return binding;
    }
    return undefined;
  }
  return {
    ...base,
    async initialize(scope, run, signal) {
      await base.initialize?.(scope, run, signal);
      const current = catalogs.get(run.id);
      if (current) {
        await service.checkPinned(scope, run.agentId, current, run.id);
        guard(current, "SECRET_OUTPUT");
      } else {
        const catalog = catalogSchema.parse(
          await service.catalog(scope, run.agentId, run.id, signal),
        );
        guard(catalog, "SECRET_OUTPUT");
        catalogs.set(run.id, catalog);
        bind(run.id, catalog);
      }
    },
    snapshot(run) {
      const baseSnapshot = base.snapshot?.(run);
      const snapshot = {
        ...(baseSnapshot === undefined ? {} : { base: baseSnapshot }),
        mcp: catalogs.get(run.id) ?? [],
      };
      guard(snapshot, "SECRET_OUTPUT");
      return snapshot;
    },
    restore(run, snapshot) {
      if (!snapshot || typeof snapshot !== "object" || !("mcp" in snapshot))
        throw new ComputerToolsError("INVALID_TOOL");
      const catalog = catalogSchema.parse(snapshot.mcp);
      guard(catalog, "SECRET_OUTPUT");
      catalogs.set(run.id, catalog);
      bind(run.id, catalog);
      if ("base" in snapshot && snapshot.base !== undefined) base.restore?.(run, snapshot.base);
    },
    definitions(run?: ExecutionRun) {
      return [
        ...base.definitions(run),
        ...Array.from(run ? (bindings.get(run.id)?.values() ?? []) : []).map(
          (binding) => binding.definition,
        ),
      ];
    },
    prepare(call: ToolCall, run?: ExecutionRun): PreparedComputerCall {
      if (!call.name.startsWith("mcp_")) return base.prepare(call, run);
      const binding = run ? bindings.get(run.id)?.get(call.name) : find(call.name);
      if (!binding) throw new ComputerToolsError("INVALID_TOOL");
      if (
        !call.id ||
        call.id.length > 128 ||
        call.id.includes("\0") ||
        call.argumentsError ||
        !call.arguments ||
        typeof call.arguments !== "object" ||
        Array.isArray(call.arguments) ||
        JSON.stringify(call.arguments).length > 40_000
      )
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      guard(call, "SECRET_INPUT");
      const input =
        call.arguments.protectedInput === undefined
          ? undefined
          : protectedInputSpecSchema.safeParse(call.arguments.protectedInput);
      if (
        input &&
        (!input.success ||
          input.data.destination.kind !== "mcp-header" ||
          !binding.perCallSecretHeader ||
          input.data.destination.name.toLowerCase() !== binding.perCallSecretHeader.toLowerCase())
      )
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      return {
        id: call.id,
        name: call.name as PreparedComputerCall["name"],
        arguments: call.arguments,
        target: `server:${binding.serverId}`,
        argumentSummary: `Remote tool ${binding.remoteName}`,
        changes: true,
        readOnlyAnnotated: binding.readOnly,
        ...(input?.success ? { protectedInput: input.data } : {}),
      };
    },
    async execute(scope, run, call, signal) {
      if (!call.name.startsWith("mcp_")) return base.execute(scope, run, call, signal);
      if (call.protectedInput) throw new ComputerToolsError("INVALID_ARGUMENTS");
      const binding = bindings.get(run.id)?.get(call.name);
      if (!binding) throw new ComputerToolsError("INVALID_TOOL");
      guard(call, "SECRET_INPUT");
      try {
        const result = await service.call(
          scope,
          run.agentId,
          run.id,
          binding,
          binding.remoteName,
          call.arguments,
          signal,
        );
        guard(result, "SECRET_OUTPUT");
        const serialized = JSON.stringify({
          source: "remote",
          untrusted: true,
          state: result.isError ? "failed" : "succeeded",
          content: result.content,
          truncated: result.truncated,
        });
        guard(serialized, "SECRET_OUTPUT");
        if (serialized.length > MAX_TOOL_RESULT)
          return JSON.stringify({
            source: "remote",
            untrusted: true,
            state: "failed",
            code: "MCP_RESULT_TOO_LARGE",
          });
        return serialized;
      } catch (error) {
        if (signal.aborted) throw signal.reason ?? new Error("MCP_CANCELLED");
        if (error instanceof ComputerToolsError) throw error;
        // A transport failure may follow a completed remote change. Let the
        // durable effect engine mark its outcome unknown and prohibit replay.
        if (error instanceof McpTransportError) throw error;
        if (error instanceof McpServerError && error.code === "MCP_OPERATION_FAILED") throw error;
        const code =
          error instanceof McpServerError || error instanceof McpTransportError
            ? error.code
            : "MCP_OPERATION_FAILED";
        return JSON.stringify({ source: "remote", untrusted: true, state: "failed", code });
      }
    },
    async executeProtected(scope, run, call, signal, value) {
      if (!call.name.startsWith("mcp_")) {
        if (!base.executeProtected) throw new ComputerToolsError("INVALID_TOOL");
        return base.executeProtected(scope, run, call, signal, value);
      }
      const prepared = this.prepare(
        {
          type: "toolCall",
          id: call.id,
          name: call.name,
          arguments: call.arguments as ToolCall["arguments"],
        },
        run,
      );
      const binding = bindings.get(run.id)?.get(call.name);
      if (!binding || prepared.protectedInput?.destination.kind !== "mcp-header")
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      const { protectedInput: _input, ...args } = call.arguments;
      const result = await service.call(
        scope,
        run.agentId,
        run.id,
        binding,
        binding.remoteName,
        args,
        signal,
        { name: prepared.protectedInput.destination.name, value },
      );
      guard(result, "SECRET_OUTPUT");
      const output = JSON.stringify({
        source: "remote",
        untrusted: true,
        state: result.isError ? "failed" : "succeeded",
        content: result.content,
        truncated: result.truncated,
      });
      if (output.length > MAX_TOOL_RESULT) throw new ComputerToolsError("SECRET_OUTPUT");
      return output;
    },
    release(run) {
      catalogs.delete(run.id);
      bindings.delete(run.id);
      service.release(run.id);
      base.release(run);
    },
  };
}
