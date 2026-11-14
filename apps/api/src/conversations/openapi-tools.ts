import type { Tool, ToolCall } from "@raypx/ai";
import {
  ComputerToolsError,
  type ComputerTools,
  type ExecutionRun,
  type PreparedComputerCall,
} from "@raypx/agents/server";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { z } from "zod";
import { matchesOpenApiSchema, OpenApiTransportError } from "@raypx/providers/openapi";
import { OpenApiServerError, type OpenApiServersService } from "./openapi-servers.js";

import { openApiOperationSchema } from "@raypx/core/openapi-servers";
import type { OpenApiToolOperation } from "@raypx/providers/openapi";
const savedTool = openApiOperationSchema.extend({
  parameters: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(128),
        in: z.enum(["path", "query"]),
        required: z.boolean(),
        schema: z.record(z.string(), z.unknown()),
      }),
    )
    .max(64),
  bodySchema: z.record(z.string(), z.unknown()).nullable(),
  bodyRequired: z.boolean(),
  inputSchema: z
    .record(z.string(), z.unknown())
    .refine((schema) => schema.type === "object" && JSON.stringify(schema).length <= 65536),
});
const catalogSchema = z
  .array(
    z.strictObject({
      serverId: z.string().uuid(),
      fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
      url: z.string().max(2048),
      tools: z.array(savedTool).max(128),
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
  url: string;
  operation: OpenApiToolOperation;
  readOnly: boolean;
  definition: Tool;
}
export function openApiToolName(serverId: string, remoteName: string): string {
  return `openapi_${serverId.replaceAll("-", "")}__${remoteName}`;
}
/** All HTTP calls stay effects, including annotated reads, so completed calls replay once. */
export function withOpenApiTools(
  base: ComputerTools,
  service: OpenApiServersService,
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
        const name = openApiToolName(server.serverId, tool.operationId);
        map.set(name, {
          serverId: server.serverId,
          fingerprint: server.fingerprint,
          remoteName: tool.operationId,
          url: server.url,
          operation: tool,
          readOnly: tool.readOnly,
          definition: {
            name,
            description: `${tool.method} ${tool.label}`,
            parameters: tool.inputSchema,
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
        openapi: catalogs.get(run.id) ?? [],
      };
      guard(snapshot, "SECRET_OUTPUT");
      return snapshot;
    },
    restore(run, snapshot) {
      if (!snapshot || typeof snapshot !== "object" || !("openapi" in snapshot))
        throw new ComputerToolsError("INVALID_TOOL");
      const catalog = catalogSchema.parse(snapshot.openapi);
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
      if (!call.name.startsWith("openapi_")) return base.prepare(call, run);
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
      if (!matchesOpenApiSchema(call.arguments, binding.operation.inputSchema))
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      const path = call.arguments.path;
      if (
        path &&
        typeof path === "object" &&
        Object.values(path).some((value) => value === "." || value === "..")
      )
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      return {
        id: call.id,
        name: call.name as PreparedComputerCall["name"],
        arguments: call.arguments,
        target:
          `${binding.operation.method} ${binding.url.replace(/\/$/, "")}${binding.operation.path}`.slice(
            0,
            1024,
          ),
        argumentSummary: `${binding.operation.method} ${binding.operation.label}`,
        changes: true,
        readOnlyHttp: binding.readOnly,
      };
    },
    async execute(scope, run, call, signal) {
      if (!call.name.startsWith("openapi_")) return base.execute(scope, run, call, signal);
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
          status: result.status,
          content: result.content,
          truncated: result.truncated,
        });
        guard(serialized, "SECRET_OUTPUT");
        if (serialized.length > MAX_TOOL_RESULT)
          return JSON.stringify({
            source: "remote",
            untrusted: true,
            state: "failed",
            code: "OPENAPI_RESULT_TOO_LARGE",
          });
        return serialized;
      } catch (error) {
        if (signal.aborted) throw signal.reason ?? new Error("OPENAPI_CANCELLED");
        if (error instanceof ComputerToolsError) throw error;
        // A transport failure may follow a completed remote change. Let the
        // durable effect engine mark its outcome unknown and prohibit replay.
        if (error instanceof OpenApiTransportError) throw error;
        if (error instanceof OpenApiServerError && error.code === "OPERATION_FAILED") throw error;
        const code =
          error instanceof OpenApiServerError || error instanceof OpenApiTransportError
            ? error.code
            : "OPERATION_FAILED";
        return JSON.stringify({ source: "remote", untrusted: true, state: "failed", code });
      }
    },
    release(run) {
      catalogs.delete(run.id);
      bindings.delete(run.id);
      service.release(run.id);
      base.release(run);
    },
  };
}
