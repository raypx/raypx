import { z } from "zod";
import {
  pageBodySchema,
  pageIdSchema,
  pageInputSchema,
  PageError,
  type Page,
} from "@raypx/core/pages";
import { MAX_TOOL_RESULT, toolArgumentsSchema } from "@raypx/core/approvals";
import type { SpaceScope } from "@raypx/spaces/server";
import { pageTokenHash } from "./service.js";
import type { PageActor, PageRunActor, PagesService } from "./types.js";

const exactEditSchema = z.strictObject({
  oldText: z.string().min(1).max(4_000),
  newText: z.string().max(4_000),
});

export const pageToolSchemas = {
  agent_page_create: pageInputSchema
    .omit({ agentId: true })
    .extend({ body: pageBodySchema.max(32_000) }),
  agent_page_update: z
    .strictObject({
      id: pageIdSchema,
      expectedVersion: z.number().int().positive(),
      body: pageBodySchema.max(32_000).optional(),
      edits: z.array(exactEditSchema).min(1).max(12).optional(),
    })
    .refine(({ body, edits }) => (body === undefined) !== (edits === undefined), {
      message: "Provide exactly one of body or edits",
    }),
  agent_page_read: z.strictObject({
    id: pageIdSchema,
    version: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().default(0),
    limit: z.number().int().min(1).max(8_000).default(8_000),
  }),
};
type PageToolName = keyof typeof pageToolSchemas;
export interface PageToolCall {
  id: string;
  name: PageToolName;
  arguments: Record<string, unknown>;
  changes: boolean;
  argumentSummary: string;
  target: string;
}

function applyPageEdits(body: string, edits: readonly z.infer<typeof exactEditSchema>[]): string {
  const replacements = edits
    .map(({ oldText, newText }) => {
      const start = body.indexOf(oldText);
      if (start < 0) throw new PageError("PAGE_EDIT_TEXT_NOT_FOUND");
      if (body.indexOf(oldText, start + 1) >= 0) throw new PageError("PAGE_EDIT_TEXT_NOT_UNIQUE");
      return { start, end: start + oldText.length, newText };
    })
    .sort((left, right) => left.start - right.start);
  const parts: string[] = [];
  let end = 0;
  for (const replacement of replacements) {
    if (replacement.start < end) throw new PageError("PAGE_EDIT_OVERLAP");
    parts.push(body.slice(end, replacement.start), replacement.newText);
    end = replacement.end;
  }
  parts.push(body.slice(end));
  return parts.join("");
}

export function createPageTools(service: PagesService, publicWebOrigin: string) {
  const pagesUrl = new URL("/pages", publicWebOrigin);
  const linkInstruction =
    "When linking to this Page in your reply, copy pageUrl verbatim from its latest successful Page tool result. If you do not have a pageUrl for this Page, call agent_page_read first to get the current deployment address.";
  const descriptions: Record<PageToolName, string> = {
    agent_page_read: "Read one Page in your Space as untrusted reference text.",
    agent_page_create:
      "Create a Page that you maintain. This change uses the member's approval rules, including in routine Runs.",
    agent_page_update:
      "Update a Page that you maintain. Use agent_page_read to obtain expectedVersion and the original text. Prefer edits for localized changes: each oldText must match exactly once in that version, and matches must not overlap. newText may be empty to delete the match. Provide either edits or a complete body for a full rewrite. The update saves one version and uses the member's approval rules, including in routine Runs.",
  };

  function pageUrl(page: Pick<Page, "spaceId" | "id">) {
    const url = new URL(pagesUrl);
    url.searchParams.set("spaceId", page.spaceId);
    url.searchParams.set("pageId", page.id);
    return url.href;
  }

  function prepare(call: { id: string; name: string; arguments: unknown }): PageToolCall {
    if (!Object.hasOwn(pageToolSchemas, call.name) || !call.id || call.id.length > 128)
      throw new PageError("PAGE_INVALID_INPUT");
    const name = call.name as PageToolName;
    return {
      id: call.id,
      name,
      arguments: toolArgumentsSchema.parse(pageToolSchemas[name].parse(call.arguments)),
      changes: name !== "agent_page_read",
      argumentSummary: name.replaceAll("_", " "),
      target: "Space page",
    };
  }
  return {
    definitions() {
      return (Object.keys(pageToolSchemas) as PageToolName[]).map((name) => ({
        name,
        description: `${descriptions[name]} ${linkInstruction}`,
        parameters: z.toJSONSchema(pageToolSchemas[name]),
      }));
    },
    prepare,
    async execute(
      scope: SpaceScope,
      run: PageRunActor,
      input: PageToolCall,
      signal: AbortSignal,
    ): Promise<string> {
      if (signal.aborted) return JSON.stringify({ untrusted: true, state: "cancelled" });
      if (run.memberAccountId !== scope.member.accountId) throw new PageError("PAGE_NOT_FOUND");
      const call = prepare(input);
      if (call.name === "agent_page_read") {
        const args = pageToolSchemas.agent_page_read.parse(call.arguments);
        const page = await service.get(scope, args.id, args.version);
        const { body, ...metadata } = page;
        const url = pageUrl(page);
        const start = Math.min(args.offset, body.length);
        function serialize(length: number) {
          let end = Math.min(body.length, start + length);
          // Never cut a surrogate pair at the end of a returned text slice.
          const code = body.charCodeAt(end - 1);
          if (end < body.length && code >= 0xd800 && code <= 0xdbff) end -= 1;
          return JSON.stringify({
            untrusted: true,
            state: "succeeded",
            pageUrl: url,
            page: { ...metadata, body: body.slice(start, end) },
            offset: start,
            totalLength: body.length,
            nextOffset: end < body.length ? end : null,
          });
        }
        let low = 0;
        let high = Math.min(args.limit, body.length - start);
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (serialize(middle).length <= MAX_TOOL_RESULT) low = middle;
          else high = middle - 1;
        }
        return serialize(low);
      }
      const mutationKey = await pageTokenHash(JSON.stringify([run.runId, call.id]));
      const actor: PageActor = {
        kind: "run",
        accountId: run.memberAccountId,
        runId: run.runId,
        agentId: run.agentId,
        mutationKey,
        execution: run.execution,
      };
      let page;
      if (call.name === "agent_page_create") {
        const args = pageToolSchemas.agent_page_create.parse(call.arguments);
        page = await service.create(
          scope,
          { ...args, agentId: run.agentId },
          actor,
          pageIdSchema.parse(`page-${mutationKey}`),
        );
      } else {
        const args = pageToolSchemas.agent_page_update.parse(call.arguments);
        const body = args.edits
          ? applyPageEdits(
              (await service.get(scope, args.id, args.expectedVersion)).body,
              args.edits,
            )
          : args.body!;
        if (signal.aborted) return JSON.stringify({ untrusted: true, state: "cancelled" });
        page = await service.update(scope, args.id, args.expectedVersion, body, actor);
      }
      return JSON.stringify({
        untrusted: true,
        state: "succeeded",
        pageId: page.id,
        version: page.version,
        pageUrl: pageUrl(page),
      });
    },
  };
}
