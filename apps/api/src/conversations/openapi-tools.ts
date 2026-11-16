import type { Tool, ToolCall } from "@raypx/ai";
import {
  ComputerToolsError,
  type ComputerTools,
  type ExecutionRun,
  type PreparedComputerCall,
} from "@raypx/agents/server";
import { MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { z } from "zod";
import { protectedInputSpecSchema, httpInputDestinationSchema } from "@raypx/core/protected-input";
import {
  matchesOpenApiSchema,
  OpenApiTransportError,
  tavilyArguments,
  tavilyDefinition,
  tavilyToolName,
  isWeatherOperation,
  weatherArguments,
  weatherDefinition,
} from "@raypx/providers/openapi";
import { weatherForecastSchema, webSourcesSchema } from "@raypx/core/conversation";
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
  presetTool?: ReturnType<typeof tavilyToolName> | "weather_forecast";
  definition: Tool;
}
export function openApiToolName(serverId: string, remoteName: string): string {
  return `openapi_${serverId.replaceAll("-", "")}__${remoteName}`;
}
function isPresetTool(name: string) {
  return name === "web_search" || name === "web_read" || name === "weather_forecast";
}
const weatherResult = z.union([
  z.strictObject({ forecast: weatherForecastSchema }),
  z.strictObject({ code: z.literal("CITY_NOT_FOUND") }),
  z.strictObject({ code: z.literal("INVALID_DATE") }),
  z.strictObject({
    code: z.literal("CITY_AMBIGUOUS"),
    choices: z.array(z.string().max(360)).max(5),
  }),
  z.strictObject({
    code: z.literal("DATE_OUT_OF_RANGE"),
    from: z.iso.date(),
    through: z.iso.date(),
  }),
  z.strictObject({ code: z.literal("FORECAST_UNAVAILABLE") }),
]);
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
        const web = tavilyToolName(server.url, tool);
        const weather = isWeatherOperation(server.url, tool);
        let presetDefinition: Tool | undefined;
        if (web) presetDefinition = tavilyDefinition(web);
        if (weather) presetDefinition = weatherDefinition;
        const presetTool = weather ? weatherDefinition.name : web;
        const name = presetTool ?? openApiToolName(server.serverId, tool.operationId);
        if (presetTool && map.has(presetTool)) continue;
        map.set(name, {
          serverId: server.serverId,
          fingerprint: server.fingerprint,
          remoteName: tool.operationId,
          url: server.url,
          operation: tool,
          readOnly: tool.readOnly,
          presetTool,
          definition: presetDefinition ?? {
            name,
            description: `${tool.method} ${tool.label}. Request protectedInput for a one-call bearer, API-key header/query or basic credential; never put its value in chat or arguments.`,
            parameters: {
              ...tool.inputSchema,
              properties: {
                ...(tool.inputSchema.properties as object),
                protectedInput: z.toJSONSchema(
                  protectedInputSpecSchema.extend({
                    destination: httpInputDestinationSchema,
                  }),
                ),
              },
            },
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
      const preset = isPresetTool(call.name);
      if (!preset && !call.name.startsWith("openapi_")) return base.prepare(call, run);
      const binding = run ? bindings.get(run.id)?.get(call.name) : !preset && find(call.name);
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
      const presetTool = binding.presetTool;
      if (presetTool) {
        const weather = presetTool === "weather_forecast";
        const valid = weather
          ? weatherArguments(call.arguments)
          : tavilyArguments(presetTool, call.arguments);
        if (!valid) throw new ComputerToolsError("INVALID_ARGUMENTS");
        return {
          id: call.id,
          name: presetTool,
          arguments: call.arguments,
          target: weather ? "Open-Meteo" : "Tavily",
          argumentSummary: binding.operation.label,
          changes: false,
          recordEffect: true,
        };
      }
      const { protectedInput: rawInput, ...operationArguments } = call.arguments;
      const input =
        rawInput === undefined ? undefined : protectedInputSpecSchema.safeParse(rawInput);
      if (
        input &&
        (!input.success || !httpInputDestinationSchema.safeParse(input.data.destination).success)
      )
        throw new ComputerToolsError("INVALID_ARGUMENTS");
      if (!matchesOpenApiSchema(operationArguments, binding.operation.inputSchema))
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
        ...(input?.success ? { protectedInput: input.data } : {}),
      };
    },
    async execute(scope, run, call, signal) {
      if (!isPresetTool(call.name) && !call.name.startsWith("openapi_"))
        return base.execute(scope, run, call, signal);
      if (call.protectedInput) throw new ComputerToolsError("INVALID_ARGUMENTS");
      const binding = bindings.get(run.id)?.get(call.name);
      if (!binding) throw new ComputerToolsError("INVALID_TOOL");
      guard(call, "SECRET_INPUT");
      const presetTool = binding.presetTool;
      const args =
        presetTool && presetTool !== "weather_forecast"
          ? tavilyArguments(presetTool, call.arguments)
          : call.arguments;
      if (!args) throw new ComputerToolsError("INVALID_ARGUMENTS");
      try {
        const result = await service.call(
          scope,
          run.agentId,
          run.id,
          binding,
          binding.remoteName,
          args,
          signal,
        );
        guard(result, "SECRET_OUTPUT");
        if (presetTool === "weather_forecast") {
          const decoded = weatherResult.parse(JSON.parse(result.content));
          const envelope = { source: "remote", untrusted: true };
          if ("forecast" in decoded)
            return JSON.stringify({
              ...envelope,
              state: "succeeded",
              weatherForecast: decoded.forecast,
            });
          return JSON.stringify({ ...envelope, state: "failed", ...decoded });
        }
        if (presetTool) {
          if (!result.isError) {
            const { sources, content } = JSON.parse(result.content) as {
              sources: unknown;
              content?: string;
            };
            return JSON.stringify({
              source: "remote",
              untrusted: true,
              state: "succeeded",
              webSources: webSourcesSchema.parse(sources),
              ...(content ? { content } : {}),
            });
          }
          return JSON.stringify({
            source: "remote",
            untrusted: true,
            state: "failed",
            code: "OPERATION_FAILED",
          });
        }
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
        if (presetTool)
          return JSON.stringify({
            source: "remote",
            untrusted: true,
            state: "failed",
            code: error instanceof OpenApiTransportError ? error.code : "OPERATION_FAILED",
          });
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
    async executeProtected(scope, run, call, signal, value) {
      if (!call.name.startsWith("openapi_")) {
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
      if (!binding || !prepared.protectedInput) throw new ComputerToolsError("INVALID_ARGUMENTS");
      const destination = httpInputDestinationSchema.parse(prepared.protectedInput.destination);
      let credential: Parameters<typeof service.call>[7];
      if (destination.kind === "http-bearer") credential = { type: "bearer", value };
      else if (destination.kind === "http-basic") credential = { type: "basic", value };
      else if (destination.in === "query")
        credential = { type: "query", name: destination.name, value };
      else credential = { type: "apiKey", header: destination.name, value };
      const { protectedInput: _input, ...args } = call.arguments;
      const result = await service.call(
        scope,
        run.agentId,
        run.id,
        binding,
        binding.remoteName,
        args,
        signal,
        credential,
      );
      guard(result, "SECRET_OUTPUT");
      const output = JSON.stringify({
        source: "remote",
        untrusted: true,
        state: result.isError ? "failed" : "succeeded",
        status: result.status,
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
