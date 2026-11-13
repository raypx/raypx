import { z } from "zod";
import {
  MAX_MEMORY_TEXT,
  SpaceMemoryError,
  spaceMemoryIdSchema,
  type SpaceMemoryInput,
} from "@raypx/core/space-memory";
import type { SpaceScope } from "@raypx/spaces/server";
import type { MemoryActor, MemoryRunActor, SpaceMemoryService } from "./types.js";

const content = z.strictObject({
  scope: z.enum(["agent", "space"]).default("agent"),
  title: z.string().trim().min(1).max(200),
  text: z.string().max(MAX_MEMORY_TEXT),
  pinned: z.boolean().default(false),
  speaker: z.string().max(200).nullable().default(null),
  source: z.string().max(500).nullable().default(null),
});
export const memoryToolSchemas = {
  agent_memory_save: content,
  agent_memory_update: content.extend({
    id: spaceMemoryIdSchema,
    expectedRevision: z.number().int().positive(),
  }),
};
export type MemoryToolName = keyof typeof memoryToolSchemas;
export interface MemoryToolCall {
  id: string;
  name: MemoryToolName;
  arguments: Record<string, unknown>;
  changes: true;
  argumentSummary: string;
  target: string;
}
export function createMemoryTools(service: SpaceMemoryService) {
  function prepare(call: { id: string; name: string; arguments: unknown }): MemoryToolCall {
    if (!Object.hasOwn(memoryToolSchemas, call.name) || !call.id || call.id.length > 128)
      throw new Error("INVALID_TOOL");
    const name = call.name as MemoryToolName;
    const parsed = memoryToolSchemas[name].parse(call.arguments);
    return {
      id: call.id,
      name,
      arguments: parsed,
      changes: true,
      argumentSummary:
        name === "agent_memory_save" ? "Save memory document" : "Update memory document",
      target: parsed.scope === "space" ? "Space memory" : "Agent memory",
    };
  }
  return {
    definitions() {
      return (Object.keys(memoryToolSchemas) as MemoryToolName[]).map((name) => ({
        name,
        description:
          name === "agent_memory_save"
            ? "Save reference knowledge in your own memory, or shared Space memory when configured. This is a change requiring the applicable approval."
            : "Update one of your own memory documents, or shared Space memory when configured, using its exact revision. This is a change requiring the applicable approval.",
        parameters: z.toJSONSchema(memoryToolSchemas[name]),
      }));
    },
    prepare,
    async execute(
      scope: SpaceScope,
      run: MemoryRunActor,
      input: MemoryToolCall,
      signal: AbortSignal,
    ): Promise<string> {
      if (signal.aborted) return JSON.stringify({ untrusted: true, state: "cancelled" });
      if (run.memberAccountId !== scope.member.accountId)
        throw new SpaceMemoryError("MEMORY_NOT_FOUND");
      const call = prepare(input);
      const parsed = memoryToolSchemas[call.name].parse(call.arguments);
      if (parsed.scope === "space" && !run.allowSharedMemory)
        throw new SpaceMemoryError("MEMORY_SHARING_DISABLED");
      const fields: SpaceMemoryInput = {
        scope: parsed.scope,
        agentId: parsed.scope === "agent" ? run.agentId : null,
        title: parsed.title,
        text: parsed.text,
        pinned: parsed.pinned,
        attribution: { speaker: parsed.speaker, source: parsed.source },
      };
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify([run.runId, call.id])),
      );
      const mutationKey = Array.from(new Uint8Array(bytes), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      const actor: MemoryActor = {
        kind: "run",
        accountId: run.memberAccountId,
        runId: run.runId,
        untrustedInput: run.untrustedInput,
        mutationKey,
        ...(run.execution ? { execution: run.execution } : {}),
      };
      let result;
      if (call.name === "agent_memory_save") {
        result = await service.create(
          scope,
          fields,
          actor,
          spaceMemoryIdSchema.parse(`memory-${mutationKey}`),
        );
      } else {
        const update = memoryToolSchemas.agent_memory_update.parse(call.arguments);
        const existing = await service.get(scope, update.id);
        if (existing.scope !== fields.scope || existing.agentId !== fields.agentId)
          throw new SpaceMemoryError("MEMORY_NOT_FOUND");
        result = await service.update(scope, update.id, update.expectedRevision, fields, actor);
      }
      return JSON.stringify({
        untrusted: true,
        state: "succeeded",
        documentId: result.id,
        revision: result.revision,
      });
    },
  };
}
