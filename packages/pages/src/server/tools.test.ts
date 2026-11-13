import { expect, it, vi } from "vitest";
import { MAX_APPROVAL_ARGUMENTS, MAX_TOOL_RESULT } from "@raypx/core/approvals";
import { agentIdSchema } from "@raypx/core/agents";
import { pageIdSchema, pageVersionSchema } from "@raypx/core/pages";
import { spaceIdSchema } from "@raypx/core/spaces";
import { resolveSpaceScope } from "@raypx/spaces/server";
import type { PagesService } from "./types.js";
import { createPageTools } from "./tools.js";

const at = "2026-01-01T00:00:00.000Z";
const scope = resolveSpaceScope(
  { spaceId: spaceIdSchema.parse("space"), accountId: "member", role: "member", createdAt: at },
  "member",
  spaceIdSchema.parse("space"),
);
const run = {
  agentId: agentIdSchema.parse("agent"),
  memberAccountId: "member",
  runId: "run",
  execution: { conversationId: "conversation", ownerId: "worker", fence: 7 },
};
it("paginates escaped Page text within the complete result budget and labels each slice untrusted", async () => {
  const body = '\u0001"\\'.repeat(5_000);
  const page = pageVersionSchema.parse({
    id: pageIdSchema.parse("page"),
    spaceId: scope.spaceId,
    agentId: run.agentId,
    title: "Report",
    kind: "document",
    version: 1,
    body,
    author: { kind: "member", accountId: "member", runId: null },
    reason: "created",
    createdAt: at,
    updatedAt: at,
  });
  const tools = createPageTools({ get: async () => page } as unknown as PagesService);
  let offset = 0;
  let reconstructed = "";
  while (offset < body.length) {
    const call = tools.prepare({
      id: "read",
      name: "agent_page_read",
      arguments: { id: page.id, offset, limit: 8_000 },
    });
    expect(call.changes).toBe(false);
    const result = await tools.execute(scope, run, call, new AbortController().signal);
    expect(result.length).toBeLessThanOrEqual(MAX_TOOL_RESULT);
    const parsed = JSON.parse(result) as {
      untrusted: boolean;
      page: { body: string };
      nextOffset: number | null;
    };
    expect(parsed.untrusted).toBe(true);
    reconstructed += parsed.page.body;
    if (parsed.nextOffset === null) break;
    expect(parsed.nextOffset).toBeGreaterThan(offset);
    offset = parsed.nextOffset;
  }
  expect(reconstructed).toBe(body);
});
it("requires change policy for writes, carries fenced mutation identity, and refuses oversized canonical arguments", async () => {
  const create = vi.fn<PagesService["create"]>(async (_scope, input, _actor, id) =>
    pageVersionSchema.parse({
      ...input,
      id,
      spaceId: scope.spaceId,
      version: 1,
      author: { kind: "run", accountId: "member", runId: run.runId },
      reason: "created",
      createdAt: at,
      updatedAt: at,
    }),
  );
  const tools = createPageTools({ create } as unknown as PagesService);
  const call = tools.prepare({
    id: "write",
    name: "agent_page_create",
    arguments: { title: "Report", kind: "document", body: "Report" },
  });
  expect(call.changes).toBe(true);
  await tools.execute(scope, run, call, new AbortController().signal);
  const actor = create.mock.calls[0]![2]!;
  expect(actor).toMatchObject({
    kind: "run",
    accountId: "member",
    runId: "run",
    agentId: "agent",
    execution: run.execution,
  });
  expect(actor.mutationKey).toMatch(/^[a-f0-9]{64}$/);
  expect(() =>
    tools.prepare({
      id: "oversize",
      name: "agent_page_create",
      arguments: { title: "Report", kind: "document", body: "\u0001".repeat(32_000) },
    }),
  ).toThrow("Tool input too large");
  expect(JSON.stringify(call.arguments).length).toBeLessThanOrEqual(MAX_APPROVAL_ARGUMENTS);
});
